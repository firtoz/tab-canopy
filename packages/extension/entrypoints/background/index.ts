import {
	type IDBDatabaseLike,
	type IDBProxyRequest,
	type IDBProxyResponse,
	IDBProxyServer,
	type IDBProxySyncMessage,
	migrateIndexedDBWithFunctions,
} from "@firtoz/drizzle-indexeddb";
import { exhaustiveGuard } from "@firtoz/maybe-error";
import { pack } from "msgpackr";
import migrations from "@/schema/drizzle/indexeddb-migrations";
import {
	type ClientMessage,
	createExtensionServerTransport,
	IDB_PORT_NAME,
	type ServerMessage,
} from "@/src/idb-transport";
import { log } from "./constants";
import { type BroadcastSyncFn, createDbOperations } from "./db-operations";
import { performFullReset, performInitialSync } from "./initial-sync";
import {
	clearTabCreatedEvents,
	disableTestMode,
	enableTestMode,
	getTabCreatedEvents,
	isTestModeEnabled,
	registerUiMoveIntent,
	setupTabListeners,
} from "./tab-handlers";
import { setupWindowListeners } from "./window-handlers";

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => {
		browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	});

	// Track the database instance for direct writes
	let db: IDBDatabaseLike | null = null;
	let broadcastSync: BroadcastSyncFn = () => {};

	// Track tabs that are part of a UI-managed window move (with children)
	const managedWindowMoveTabIds = new Set<number>();

	// Create DB operations with getters for the mutable state
	const dbOps = createDbOperations(
		() => db,
		() => broadcastSync,
	);

	// Setup browser event listeners - pass getter for managed move tab IDs
	const tabHandlers = setupTabListeners(dbOps, () => managedWindowMoveTabIds);
	const windowHandlers = setupWindowListeners(dbOps);

	// IDB Proxy Server Setup
	const migratingDbCreator = async (dbName: string) => {
		log(`[Server] Opening database with migrations: ${dbName}`);
		return await migrateIndexedDBWithFunctions(dbName, migrations, true);
	};

	let requestHandler:
		| ((request: IDBProxyRequest) => Promise<IDBProxyResponse>)
		| null = null;

	// Track which client enabled test mode
	let testModeClientId: string | null = null;

	// Create the extension transport
	const serverTransport = createExtensionServerTransport<
		ClientMessage,
		ServerMessage
	>({
		portName: IDB_PORT_NAME,
		onMessage: async (message, client, broadcast) => {
			switch (message.type) {
				case "idbRequest": {
					if (!requestHandler) {
						client.port.postMessage([
							...pack({
								direction: "toClient",
								payload: {
									type: "idbResponse",
									payload: {
										id: message.payload.id,
										type: "error",
										error: "Server not ready",
									},
								},
							}),
						]);
						return;
					}
					const response = await requestHandler({
						...message.payload,
						clientId: client.clientId,
					});
					client.port.postMessage([
						...pack({
							direction: "toClient",
							payload: { type: "idbResponse", payload: response },
						}),
					]);
					break;
				}
				case "broadcast":
					broadcast(
						{
							type: "broadcast",
							channel: message.channel,
							data: message.data,
							fromClientId: client.clientId,
						},
						client.clientId,
					);
					break;
				case "resetDatabase":
					log("[Background] Received reset database request");
					await performFullReset(dbOps);
					// Notify all clients that reset is complete
					broadcast({ type: "resetDatabaseComplete" });
					break;
				case "uiMoveIntent": {
					// Register UI move intents to prevent race conditions with onMoved handler
					const moves = message.moves as Array<{
						tabId: number;
						parentTabId: number | null;
						treeOrder: string;
					}>;
					log("[Background] Received UI move intent for", moves.length, "tabs");
					for (const move of moves) {
						registerUiMoveIntent(move.tabId, move.parentTabId, move.treeOrder);
					}
					break;
				}
				case "startManagedWindowMove": {
					// Mark these tabs as part of a managed move to prevent child promotion
					log(
						"[Background] Starting managed window move for",
						message.tabIds.length,
						"tabs",
					);
					for (const tabId of message.tabIds) {
						managedWindowMoveTabIds.add(tabId);
					}
					break;
				}
				case "endManagedWindowMove": {
					// Clear the managed move set
					log("[Background] Ending managed window move");
					managedWindowMoveTabIds.clear();
					break;
				}
				case "getTabCreatedEvents":
					// Return tab created events for tests
					client.port.postMessage([
						...pack({
							direction: "toClient",
							payload: {
								type: "tabCreatedEvents",
								events: getTabCreatedEvents(),
							},
						}),
					]);
					break;
				case "clearTabCreatedEvents":
					// Clear tab created events for tests
					clearTabCreatedEvents();
					break;
				case "enableTestMode":
					console.log("[Background] Received enable test mode request");
					// Enable test mode
					enableTestMode();
					testModeClientId = client.clientId;
					log("[Background] Test mode enabled by client:", client.clientId);
					break;
				case "disableTestMode":
					console.log("[Background] Received disable test mode request");
					// Disable test mode and clear events
					disableTestMode();
					if (testModeClientId === client.clientId) {
						testModeClientId = null;
					}
					break;
				case "injectBrowserEvent":
					// Only allow event injection in test mode
					if (!isTestModeEnabled()) {
						log("[Background] Ignoring event injection - not in test mode");
						return;
					}

					log("[Background] Injecting browser event:", message.event.eventType);

					// Route to appropriate handler based on event type
					// TypeScript will narrow the type based on eventType
					try {
						switch (message.event.eventType) {
							case "tabs.onCreated":
								await tabHandlers.handleTabCreated(message.event.eventData);
								break;
							case "tabs.onUpdated":
								await tabHandlers.handleTabUpdated(
									message.event.eventData.tabId,
									message.event.eventData.changeInfo,
									message.event.eventData.tab,
								);
								break;
							case "tabs.onMoved":
								await tabHandlers.handleTabMoved(
									message.event.eventData.tabId,
									message.event.eventData.moveInfo,
								);
								break;
							case "tabs.onRemoved":
								await tabHandlers.handleTabRemoved(
									message.event.eventData.tabId,
									message.event.eventData.removeInfo,
								);
								break;
							case "tabs.onActivated":
								await tabHandlers.handleTabActivated(message.event.eventData);
								break;
							case "tabs.onDetached":
								await tabHandlers.handleTabDetached(
									message.event.eventData.tabId,
									message.event.eventData.detachInfo,
								);
								break;
							case "tabs.onAttached":
								await tabHandlers.handleTabAttached(
									message.event.eventData.tabId,
									message.event.eventData.attachInfo,
								);
								break;
							case "windows.onCreated":
								await windowHandlers.handleWindowCreated(
									message.event.eventData,
								);
								break;
							case "windows.onRemoved":
								await windowHandlers.handleWindowRemoved(
									message.event.eventData,
								);
								break;
							case "windows.onFocusChanged":
								await windowHandlers.handleWindowFocusChanged(
									message.event.eventData,
								);
								break;
						}
					} catch (error) {
						log("[Background] Error injecting event:", error);
					}
					break;
				case "ping":
					// Respond to ping to keep connection alive
					serverTransport.send(client.clientId, { type: "pong" });
					break;
				default:
					exhaustiveGuard(message);
					break;
			}
		},
		onDisconnect: (clientId) => {
			console.log("[Background] Client disconnected:", clientId);
			// If the test client disconnects, disable test mode
			if (testModeClientId === clientId) {
				log("[Background] Test client disconnected, disabling test mode");
				disableTestMode();
				testModeClientId = null;
			}
		},
	});

	// Wire up broadcast function
	broadcastSync = (message: IDBProxySyncMessage, excludeClientId?: string) => {
		serverTransport.broadcast(
			{ type: "idbSync", payload: message },
			excludeClientId,
		);
	};

	const server = new IDBProxyServer({
		transport: {
			onRequest(handler) {
				requestHandler = handler;
			},
			broadcast: broadcastSync,
		},
		onDatabaseInit: async (dbName, database) => {
			log("[Server] Database initialized:", dbName);
			db = database;
			// Perform initial sync once database is ready
			await performInitialSync(dbOps);
		},
		dbCreator: migratingDbCreator,
	});

	server.start();
	log("[Background] IDB Proxy Server started");
});
