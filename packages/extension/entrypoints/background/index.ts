import type { SyncMessage } from "@firtoz/db-helpers";
import type { IDBDatabaseLike } from "@firtoz/drizzle-indexeddb";
import { migrateIndexedDBWithFunctions } from "@firtoz/drizzle-indexeddb";
import { exhaustiveGuard } from "@firtoz/maybe-error";
import migrations from "@/schema/drizzle/indexeddb-migrations";
import type { Tab, Window } from "@/schema/src/schema";
import {
	type ClientMessage,
	createExtensionServerTransport,
	IDB_PORT_NAME,
	type ServerMessage,
} from "@/src/idb-transport";
import { DB_NAME, log } from "./constants";
import { type BroadcastSyncFn, createDbOperations } from "./db-operations";
import { performFullReset, performInitialSync } from "./initial-sync";
import {
	clearTabCreatedEvents,
	disableTestMode,
	enableTestMode,
	getTabCreatedEvents,
	isTestModeEnabled,
	registerPendingChildIntent,
	registerUiMoveIntent,
	setupTabListeners,
} from "./tab-handlers";
import { setupWindowListeners } from "./window-handlers";

/** Alarm name for waking the service worker. Chrome MV3 allows min 1 minute period. */
const KEEPALIVE_ALARM_NAME = "tabcanopy-keepalive";
const KEEPALIVE_ALARM_PERIOD_MINUTES = 1;

function scheduleKeepaliveAlarm() {
	browser.alarms.get(KEEPALIVE_ALARM_NAME).then((existing) => {
		if (!existing) {
			browser.alarms.create(KEEPALIVE_ALARM_NAME, {
				periodInMinutes: KEEPALIVE_ALARM_PERIOD_MINUTES,
			});
			log(
				"[Background] Keepalive alarm scheduled (every",
				KEEPALIVE_ALARM_PERIOD_MINUTES,
				"min)",
			);
		}
	});
}

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => {
		// Chrome-only: Set side panel to open on action click
		// Firefox uses sidebar_action which doesn't need this config
		browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
		scheduleKeepaliveAlarm();
	});

	// Keep service worker from going dormant when sidebar is closed (reconcile parent/child etc.)
	scheduleKeepaliveAlarm();
	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === KEEPALIVE_ALARM_NAME) {
			// No-op: waking the worker is the only goal
		}
	});

	// Track the database instance for direct writes
	let db: IDBDatabaseLike | null = null;
	let dbReadyResolve: () => void;
	const dbReady = new Promise<void>((resolve) => {
		dbReadyResolve = resolve;
	});
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

	// Track which client enabled test mode
	let testModeClientId: string | null = null;

	// Create the extension transport
	const serverTransport = createExtensionServerTransport<
		ClientMessage,
		ServerMessage
	>({
		portName: IDB_PORT_NAME,
		onConnect: async (client) => {
			// New client: wait for DB then send full current state so sidepanel hydrates
			await dbReady;
			if (!db) return;
			const windows = await dbOps.getAll<Window>("window");
			const tabs = await dbOps.getAll<Tab>("tab");
			const windowMessages: SyncMessage[] = windows.map((w) => ({
				type: "insert",
				value: w,
			}));
			const tabMessages: SyncMessage[] = tabs.map((t) => ({
				type: "insert",
				value: t,
			}));
			if (windowMessages.length > 0) {
				serverTransport.send(client.clientId, {
					type: "sync",
					storeName: "window",
					messages: windowMessages,
				});
			}
			if (tabMessages.length > 0) {
				serverTransport.send(client.clientId, {
					type: "sync",
					storeName: "tab",
					messages: tabMessages,
				});
			}
			log(
				"[Background] Sent initial state to client:",
				client.clientId,
				windows.length,
				"windows",
				tabs.length,
				"tabs",
			);
		},
		onMessage: async (message, client, broadcast) => {
			switch (message.type) {
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
					// Register intent synchronously so it's visible before any TabMoved runs.
					const moves = message.moves;
					log("[Background] Received UI move intent for", moves.length, "tabs");
					for (const move of moves) {
						registerUiMoveIntent(move.tabId, move.parentTabId, move.treeOrder);
					}

					// Persist intent to DB immediately. This ensures tree structure is saved
					// even if the move doesn't trigger a browser event (e.g. only indentation changed).
					const existingTabs = await dbOps.getAll<Tab>("tab");
					const existingMap = new Map<number, Tab>();
					for (const tab of existingTabs) {
						existingMap.set(tab.browserTabId, tab);
					}

					const recordsToUpdate: Tab[] = [];
					for (const move of moves) {
						const existing = existingMap.get(move.tabId);
						if (existing) {
							recordsToUpdate.push({
								...existing,
								parentTabId: move.parentTabId,
								treeOrder: move.treeOrder,
							});
						}
					}

					if (recordsToUpdate.length > 0) {
						log(
							"[Background] Persisting UI move intent to DB:",
							recordsToUpdate.length,
							"records",
						);
						await dbOps.putItems("tab", recordsToUpdate);
					}

					// Send acknowledgment back to the client
					serverTransport.send(client.clientId, {
						type: "uiMoveIntentAck",
						requestId: message.requestId,
					});
					break;
				}
				case "pendingChildTab": {
					// Register pending child intent BEFORE tab is created
					// This allows us to set the correct parent when the tab is created,
					// since Chrome doesn't propagate openerTabId from browser.tabs.create()
					const { windowId, expectedIndex, parentTabId, treeOrder } =
						message.data;
					log("[Background] Received pending child tab intent:", {
						windowId,
						expectedIndex,
						parentTabId,
						treeOrder,
					});
					registerPendingChildIntent(
						windowId,
						expectedIndex,
						parentTabId,
						treeOrder,
					);
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
					serverTransport.send(client.clientId, {
						type: "tabCreatedEvents",
						events: getTabCreatedEvents(),
					});
					break;
				case "clearTabCreatedEvents":
					// Clear tab created events for tests
					clearTabCreatedEvents();
					break;
				case "enableTestMode":
					log("[Background] Received enable test mode request");
					// Enable test mode
					enableTestMode();
					testModeClientId = client.clientId;
					log("[Background] Test mode enabled by client:", client.clientId);
					break;
				case "disableTestMode":
					log("[Background] Received disable test mode request");
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
				case "fetchFavicon": {
					// Fetch favicon through background script to avoid CORS/CSP issues
					const { url, requestId } = message;

					// Helper to convert blob to data URL
					const blobToDataUrl = (blob: Blob): Promise<string> => {
						return new Promise((resolve, reject) => {
							const reader = new FileReader();
							reader.onloadend = () => resolve(reader.result as string);
							reader.onerror = reject;
							reader.readAsDataURL(blob);
						});
					};

					try {
						// Skip internal browser URLs
						if (
							url.startsWith("chrome://") ||
							url.startsWith("chrome-extension://") ||
							url.startsWith("about:")
						) {
							serverTransport.send(client.clientId, {
								type: "faviconResponse",
								requestId,
								dataUrl: null,
							});
							break;
						}

						let dataUrl: string | null = null;

						// Try direct fetch first
						try {
							const response = await fetch(url);
							if (response.ok) {
								const blob = await response.blob();
								dataUrl = await blobToDataUrl(blob);
							}
						} catch {
							// Direct fetch failed (likely CORS), try CORS proxy fallback
							try {
								// Use corsproxy.io to bypass CORS restrictions
								const fallbackUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
								const fallbackResponse = await fetch(fallbackUrl);
								if (fallbackResponse.ok) {
									const blob = await fallbackResponse.blob();
									dataUrl = await blobToDataUrl(blob);
								}
							} catch {
								// Both failed, will send null
							}
						}

						serverTransport.send(client.clientId, {
							type: "faviconResponse",
							requestId,
							dataUrl,
							error: dataUrl ? undefined : "Failed to fetch favicon",
						});
					} catch (error) {
						serverTransport.send(client.clientId, {
							type: "faviconResponse",
							requestId,
							dataUrl: null,
							error: error instanceof Error ? error.message : String(error),
						});
					}
					break;
				}
				case "ping":
					// Respond to ping to keep connection alive
					serverTransport.send(client.clientId, { type: "pong" });
					break;
				case "patchTab": {
					const existingTabs = await dbOps.getAll<Tab>("tab");
					const existing = existingTabs.find(
						(t) => t.browserTabId === message.tabId,
					);
					if (existing) {
						const updated: Tab = {
							...existing,
							titleOverride: message.patch.titleOverride,
						};
						await dbOps.putItems("tab", [updated]);
					}
					break;
				}
				case "patchWindow": {
					const existingWindows = await dbOps.getAll<Window>("window");
					const existing = existingWindows.find(
						(w) => w.browserWindowId === message.windowId,
					);
					if (existing) {
						const updated: Window = {
							...existing,
							titleOverride: message.patch.titleOverride,
						};
						await dbOps.putItems("window", [updated]);
					}
					break;
				}
				default:
					exhaustiveGuard(message);
					break;
			}
		},
		onDisconnect: (clientId) => {
			log("[Background] Client disconnected:", clientId);
			// If the test client disconnects, disable test mode
			if (testModeClientId === clientId) {
				log("[Background] Test client disconnected, disabling test mode");
				disableTestMode();
				testModeClientId = null;
			}
		},
	});

	// Wire up broadcast: db-operations sends { type: "sync", storeName, messages } (SyncBroadcastPayload)
	broadcastSync = (message, excludeClientId?: string) => {
		serverTransport.broadcast(message, excludeClientId);
	};

	// Open DB directly (no proxy); then run initial sync
	migratingDbCreator(DB_NAME)
		.then((database) => {
			db = database;
			log("[Background] Database initialized:", DB_NAME);
			return performInitialSync(dbOps);
		})
		.then(() => {
			log("[Background] Initial sync complete");
		})
		.finally(() => {
			dbReadyResolve();
		})
		.catch((err) => {
			console.error("[Background] Failed to open DB or run initial sync:", err);
		});
});
