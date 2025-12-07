import type {
	IDBProxyClientTransport,
	IDBProxyRequest,
	IDBProxyResponse,
	IDBProxySyncMessage,
} from "@firtoz/drizzle-indexeddb";
import {
	type ClientMessage,
	createExtensionClientTransport,
	IDB_PORT_NAME,
	type ServerMessage,
} from "@/src/idb-transport";

// ============================================================================
// Create IDBProxyClientTransport from Extension Transport
// ============================================================================
export function createIDBTransportAdapter(): {
	transport: IDBProxyClientTransport;
	dispose: () => void;
} {
	const pendingRequests = new Map<
		string,
		{
			resolve: (response: IDBProxyResponse) => void;
			reject: (error: Error) => void;
		}
	>();
	let syncHandler: ((message: IDBProxySyncMessage) => void) | null = null;

	const extensionTransport = createExtensionClientTransport<
		ClientMessage,
		ServerMessage
	>({
		portName: IDB_PORT_NAME,
		onMessage: (message) => {
			if (message.type === "idbResponse") {
				const pending = pendingRequests.get(message.payload.id);
				if (pending) {
					pending.resolve(message.payload);
					pendingRequests.delete(message.payload.id);
				}
			} else if (message.type === "idbSync") {
				syncHandler?.(message.payload);
			}
		},
		onDisconnect: () => {
			console.log("[Sidepanel] Disconnected from background");
			for (const pending of pendingRequests.values()) {
				pending.reject(new Error("Connection closed"));
			}
			pendingRequests.clear();
		},
	});

	const transport: IDBProxyClientTransport = {
		sendRequest: async (
			request: IDBProxyRequest,
		): Promise<IDBProxyResponse> => {
			return new Promise((resolve, reject) => {
				pendingRequests.set(request.id, { resolve, reject });
				extensionTransport.send({ type: "idbRequest", payload: request });
			});
		},
		onSync: (handler: (message: IDBProxySyncMessage) => void) => {
			syncHandler = handler;
		},
		dispose: () => {
			extensionTransport.dispose();
			pendingRequests.clear();
		},
	};

	return {
		transport,
		dispose: () => transport.dispose?.(),
	};
}
