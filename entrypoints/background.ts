import {
	type IDBProxyRequest,
	type IDBProxyResponse,
	IDBProxyServer,
	migrateIndexedDBWithFunctions,
} from "@firtoz/drizzle-indexeddb";
import migrations from "@/schema/drizzle/indexeddb-migrations";
import {
	type ClientMessage,
	createExtensionServerTransport,
	IDB_PORT_NAME,
	type ServerMessage,
} from "@/src/idb-transport";

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(() => {
		browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
	});

	const migratingDbCreator = async (dbName: string) => {
		console.log(`[Server] Opening database with migrations: ${dbName}`);
		return await migrateIndexedDBWithFunctions(dbName, migrations, false);
	};

	// Create IDB proxy server
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
				// Handle IDB request
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
				// Relay broadcast to all OTHER clients
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

	const server = new IDBProxyServer({
		transport: {
			onRequest(handler) {
				requestHandler = handler;
			},
			broadcast(message, excludeClientId) {
				serverTransport.broadcast(
					{ type: "idbSync", payload: message },
					excludeClientId,
				);
			},
		},
		onDatabaseInit: async (dbName, db) => {
			console.log("[Server] Database initialized:", dbName, db);
		},
		dbCreator: migratingDbCreator,
	});

	server.start();
	console.log("[Background] IDB Proxy Server started");
});
