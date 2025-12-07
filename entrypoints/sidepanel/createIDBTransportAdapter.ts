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
// Date Serialization Helpers
// ============================================================================

// ISO 8601 date string pattern
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

// Fields that should be converted from ISO strings to Date objects
const DATE_FIELDS = new Set(["createdAt", "updatedAt", "deletedAt"]);

/**
 * Recursively convert ISO date strings to Date objects in an object.
 * This is needed because Date objects are serialized to ISO strings
 * when passed through browser extension messaging.
 */
function reviveDates<T>(obj: T): T {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(reviveDates) as T;
	}

	if (typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			if (
				DATE_FIELDS.has(key) &&
				typeof value === "string" &&
				ISO_DATE_REGEX.test(value)
			) {
				result[key] = new Date(value);
			} else if (typeof value === "object") {
				result[key] = reviveDates(value);
			} else {
				result[key] = value;
			}
		}
		return result as T;
	}

	return obj;
}

/**
 * Transform IDBProxyResponse to convert date strings back to Date objects
 */
function transformResponse(response: IDBProxyResponse): IDBProxyResponse {
	if (response.type === "success" && response.data !== undefined) {
		return {
			...response,
			data: reviveDates(response.data),
		};
	}
	return response;
}

/**
 * Transform IDBProxySyncMessage to convert date strings back to Date objects
 */
function transformSyncMessage(
	message: IDBProxySyncMessage,
): IDBProxySyncMessage {
	if (message.type === "sync:put" && message.items) {
		return {
			...message,
			items: reviveDates(message.items),
		};
	}
	return message;
}

// ============================================================================
// Create IDBProxyClientTransport from Extension Transport
// ============================================================================
export function createIDBTransportAdapter(): {
	transport: IDBProxyClientTransport;
	resetDatabase: () => Promise<void>;
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
	let resetResolve: (() => void) | null = null;

	const extensionTransport = createExtensionClientTransport<
		ClientMessage,
		ServerMessage
	>({
		portName: IDB_PORT_NAME,
		onMessage: (message) => {
			if (message.type === "idbResponse") {
				const pending = pendingRequests.get(message.payload.id);
				if (pending) {
					// Transform dates in the response
					pending.resolve(transformResponse(message.payload));
					pendingRequests.delete(message.payload.id);
				}
			} else if (message.type === "idbSync") {
				// Transform dates in the sync message
				console.log(
					"[Sidepanel] Received sync:",
					message.payload.type,
					message.payload.storeName,
				);
				syncHandler?.(transformSyncMessage(message.payload));
			} else if (message.type === "resetDatabaseComplete") {
				console.log("[Sidepanel] Database reset complete");
				if (resetResolve) {
					resetResolve();
					resetResolve = null;
				}
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

	const resetDatabase = (): Promise<void> => {
		return new Promise((resolve) => {
			resetResolve = resolve;
			extensionTransport.send({ type: "resetDatabase" });
		});
	};

	return {
		transport,
		resetDatabase,
		dispose: () => transport.dispose?.(),
	};
}
