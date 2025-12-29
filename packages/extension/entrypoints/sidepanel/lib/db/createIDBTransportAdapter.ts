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
import { log } from "../../../background/constants";

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
	sendMoveIntent: (moves: UiMoveIntentData[]) => Promise<void>;
	startManagedWindowMove: (tabIds: number[]) => Promise<void>;
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
	const pendingMoveIntents = new Map<string, () => void>();
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
					pending.resolve(message.payload);
					pendingRequests.delete(message.payload.id);
				}
			} else if (message.type === "idbSync") {
				// Transform dates in the sync message
				log(
					"[Sidepanel] Received sync:",
					message.payload.type,
					message.payload.storeName,
				);
				syncHandler?.(message.payload);
			} else if (message.type === "resetDatabaseComplete") {
				console.log("[Sidepanel] Database reset complete");
				if (resetResolve) {
					resetResolve();
					resetResolve = null;
				}
			} else if (message.type === "uiMoveIntentAck") {
				log(
					"[Sidepanel] Received move intent acknowledgment:",
					message.requestId,
				);
				const resolve = pendingMoveIntents.get(message.requestId);
				if (resolve) {
					resolve();
					pendingMoveIntents.delete(message.requestId);
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
			// Resolve all pending move intents so they don't hang
			for (const resolve of pendingMoveIntents.values()) {
				resolve();
			}
			pendingMoveIntents.clear();
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

	const sendMoveIntent = async (moves: UiMoveIntentData[]): Promise<void> => {
		log("[Sidepanel] Sending move intent for", moves.length, "tabs");
		const requestId = `move-intent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

		return new Promise((resolve) => {
			pendingMoveIntents.set(requestId, resolve);
			extensionTransport.send({ type: "uiMoveIntent", requestId, moves });

			// Timeout fallback in case ack is never received
			setTimeout(() => {
				const pending = pendingMoveIntents.get(requestId);
				if (pending) {
					log("[Sidepanel] Move intent ack timeout for", requestId);
					pending();
					pendingMoveIntents.delete(requestId);
				}
			}, 1000);
		});
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

	const startManagedWindowMove = async (tabIds: number[]): Promise<void> => {
		log("[Sidepanel] Starting managed window move for", tabIds.length, "tabs");
		extensionTransport.send({
			type: "startManagedWindowMove",
			tabIds,
		});
		// Give the background a delay to process the message and update its managed set
		// before we start calling browser.tabs.move(). This prevents the race condition where
		// onAttached fires before the background has added the tab to managedMoveTabIds.
		await new Promise((resolve) => setTimeout(resolve, 100));
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
