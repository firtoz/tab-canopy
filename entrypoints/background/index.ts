import {
	createStandaloneCollection,
	type IDBDatabaseLike,
	type IDBProxyRequest,
	type IDBProxyResponse,
	IDBProxyServer,
	type IDBProxySyncMessage,
	migrateIndexedDBWithFunctions,
} from "@firtoz/drizzle-indexeddb";
import migrations from "@/schema/drizzle/indexeddb-migrations";
import * as schema from "@/schema/src/schema";
import {
	type ClientMessage,
	createExtensionServerTransport,
	IDB_PORT_NAME,
	type ServerMessage,
} from "@/src/idb-transport";
import { log } from "./constants";
import { type BroadcastSyncFn, createDbOperations } from "./db-operations";
import { performFullReset, performInitialSync } from "./initial-sync";
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
			} else if (message.type === "resetDatabase") {
				log("[Background] Received reset database request");
				await performFullReset(dbOps);
				// Notify all clients that reset is complete
				broadcast({ type: "resetDatabaseComplete" });
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

	// const testSomething = async () => {
	// 	const dbName = "trySomething.db";
	// 	const debug = true;

	// 	const collection = createStandaloneCollection({
	// 		dbName,
	// 		table: schema.windowTable,
	// 		storeName: "window",
	// 		debug,
	// 	});

	// 	try {
	// 		await collection.ready;

	// 		console.log("[testCollection] waiting for ready promise");

	// 		const items = collection.getAll();
	// 		console.log("[testCollection] items", items);

	// 		if (items.length === 0) {
	// 			const insertPromise = collection.insert({
	// 				browserWindowId: 1,
	// 				focused: true,
	// 				state: "normal",
	// 				incognito: false,
	// 				type: "normal",
	// 			});

	// 			insertPromise.then(
	// 				(transaction) => {
	// 					console.log("[insertTransaction] transaction", transaction);
	// 				},
	// 				(error) => {
	// 					console.error("[insertTransaction] error", error);
	// 				},
	// 			);
	// 		} else {
	// 			console.log("[testCollection] items not empty", items);
	// 		}
	// 	} catch (error) {
	// 		log("Error opening indexeddb", error);
	// 	}
	// };

	// testSomething();
});
