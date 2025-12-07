import {
	type IDBDatabaseLike,
	type IDBProxyRequest,
	type IDBProxyResponse,
	IDBProxyServer,
	type IDBProxySyncMessage,
	migrateIndexedDBWithFunctions,
} from "@firtoz/drizzle-indexeddb";
import migrations from "@/schema/drizzle/indexeddb-migrations";
import {
	type ClientMessage,
	createExtensionServerTransport,
	IDB_PORT_NAME,
	type ServerMessage,
} from "@/src/idb-transport";

import { log } from "./constants";
import { type BroadcastSyncFn, createDbOperations } from "./db-operations";
import { performInitialSync } from "./initial-sync";
import { setupTabListeners } from "./tab-handlers";
import { setupWindowListeners } from "./window-handlers";

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => {
		browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	});

	// Track the database instance for direct writes
	let db: IDBDatabaseLike | null = null;
	let broadcastSync: BroadcastSyncFn = () => {};

	// Create DB operations with getters for the mutable state
	const dbOps = createDbOperations(
		() => db,
		() => broadcastSync,
	);

	// Setup browser event listeners
	setupTabListeners(dbOps);
	setupWindowListeners(dbOps);

	// IDB Proxy Server Setup
	const migratingDbCreator = async (dbName: string) => {
		log(`[Server] Opening database with migrations: ${dbName}`);
		return await migrateIndexedDBWithFunctions(dbName, migrations, true);
	};

	let requestHandler:
		| ((request: IDBProxyRequest) => Promise<IDBProxyResponse>)
		| null = null;

	// Create the extension transport
	const serverTransport = createExtensionServerTransport<
		ClientMessage,
		ServerMessage
	>({
		portName: IDB_PORT_NAME,
		onMessage: async (message, client, broadcast) => {
			if (message.type === "idbRequest") {
				if (!requestHandler) {
					client.port.postMessage({
						direction: "toClient",
						payload: {
							type: "idbResponse",
							payload: {
								id: message.payload.id,
								type: "error",
								error: "Server not ready",
							},
						},
					});
					return;
				}
				const response = await requestHandler({
					...message.payload,
					clientId: client.clientId,
				});
				client.port.postMessage({
					direction: "toClient",
					payload: { type: "idbResponse", payload: response },
				});
			} else if (message.type === "broadcast") {
				broadcast(
					{
						type: "broadcast",
						channel: message.channel,
						data: message.data,
						fromClientId: client.clientId,
					},
					client.clientId,
				);
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
