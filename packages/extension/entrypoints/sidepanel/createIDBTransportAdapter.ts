import type {
	IDBProxyClientTransport,
	IDBProxyRequest,
	IDBProxyResponse,
	IDBProxySyncMessage,
} from "@firtoz/drizzle-indexeddb";
import type { Browser } from "wxt/browser";
import {
	type ClientMessage,
	createExtensionClientTransport,
	IDB_PORT_NAME,
	type ServerMessage,
	type UiMoveIntentData,
} from "@/src/idb-transport";
import { log } from "../background/constants";

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
export interface TabCreatedEvent {
	tabId: number;
	openerTabId: number | undefined;
	tabIndex: number;
	decidedParentId: number | null;
	reason: string;
	timestamp: number;
}

export type InjectBrowserEvent =
	| { eventType: "tabs.onCreated"; eventData: Browser.tabs.Tab }
	| {
			eventType: "tabs.onUpdated";
			eventData: {
				tabId: number;
				changeInfo: Browser.tabs.OnUpdatedInfo;
				tab: Browser.tabs.Tab;
			};
	  }
	| {
			eventType: "tabs.onMoved";
			eventData: { tabId: number; moveInfo: Browser.tabs.OnMovedInfo };
	  }
	| {
			eventType: "tabs.onRemoved";
			eventData: { tabId: number; removeInfo: Browser.tabs.OnRemovedInfo };
	  }
	| { eventType: "tabs.onActivated"; eventData: Browser.tabs.OnActivatedInfo }
	| {
			eventType: "tabs.onDetached";
			eventData: { tabId: number; detachInfo: Browser.tabs.OnDetachedInfo };
	  }
	| {
			eventType: "tabs.onAttached";
			eventData: { tabId: number; attachInfo: Browser.tabs.OnAttachedInfo };
	  }
	| { eventType: "windows.onCreated"; eventData: Browser.windows.Window }
	| { eventType: "windows.onRemoved"; eventData: number }
	| { eventType: "windows.onFocusChanged"; eventData: number };

export function createIDBTransportAdapter(options?: {
	onDisconnect?: () => void;
}): {
	transport: IDBProxyClientTransport;
	resetDatabase: () => Promise<void>;
	sendMoveIntent: (moves: UiMoveIntentData[]) => void;
	startManagedWindowMove: (tabIds: number[]) => void;
	endManagedWindowMove: () => void;
	enableTestMode: () => void;
	injectBrowserEvent: (event: InjectBrowserEvent) => void;
	getTabCreatedEvents: () => Promise<TabCreatedEvent[]>;
	clearTabCreatedEvents: () => void;
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
	let tabCreatedEventsResolve: ((events: TabCreatedEvent[]) => void) | null =
		null;

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
				log(
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
			} else if (message.type === "tabCreatedEvents") {
				console.log("[Sidepanel] Received tab created events");
				if (tabCreatedEventsResolve) {
					tabCreatedEventsResolve(message.events);
					tabCreatedEventsResolve = null;
				}
			} else if (message.type === "pong") {
				// Pong received, connection is alive
			}
		},
		onDisconnect: () => {
			console.log("[Sidepanel] Disconnected from background");
			for (const pending of pendingRequests.values()) {
				pending.reject(new Error("Connection closed"));
			}
			pendingRequests.clear();
			// Notify App component to reconnect
			options?.onDisconnect?.();
		},
	});

	// Setup keepalive heartbeat to prevent service worker from going idle
	// Send ping every 20 seconds (service worker timeout is ~30s)
	const keepaliveInterval = setInterval(() => {
		extensionTransport.send({ type: "ping" });
	}, 20000);

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
			clearInterval(keepaliveInterval);
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

	const sendMoveIntent = (moves: UiMoveIntentData[]): void => {
		log("[Sidepanel] Sending move intent for", moves.length, "tabs");
		extensionTransport.send({ type: "uiMoveIntent", moves });
	};

	const enableTestMode = (): void => {
		console.log("[Sidepanel] Enabling test mode");
		extensionTransport.send({ type: "enableTestMode" });
	};

	const getTabCreatedEvents = (): Promise<TabCreatedEvent[]> => {
		return new Promise((resolve) => {
			tabCreatedEventsResolve = resolve;
			extensionTransport.send({ type: "getTabCreatedEvents" });
		});
	};

	const clearTabCreatedEvents = (): void => {
		extensionTransport.send({ type: "clearTabCreatedEvents" });
	};

	const injectBrowserEvent = (event: InjectBrowserEvent): void => {
		extensionTransport.send({ type: "injectBrowserEvent", event });
	};

	const startManagedWindowMove = (tabIds: number[]): void => {
		log("[Sidepanel] Starting managed window move for", tabIds.length, "tabs");
		extensionTransport.send({ type: "startManagedWindowMove", tabIds });
	};

	const endManagedWindowMove = (): void => {
		log("[Sidepanel] Ending managed window move");
		extensionTransport.send({ type: "endManagedWindowMove" });
	};

	return {
		transport,
		resetDatabase,
		sendMoveIntent,
		startManagedWindowMove,
		endManagedWindowMove,
		enableTestMode,
		injectBrowserEvent,
		getTabCreatedEvents,
		clearTabCreatedEvents,
		dispose: () => transport.dispose?.(),
	};
}
