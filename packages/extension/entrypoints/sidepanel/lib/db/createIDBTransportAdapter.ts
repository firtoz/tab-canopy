import type {
	IDBProxyClientTransport,
	IDBProxyRequest,
	IDBProxyResponse,
	IDBProxySyncMessage,
} from "@firtoz/drizzle-indexeddb";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { Browser } from "wxt/browser";
import {
	type ClientMessage,
	createExtensionClientTransport,
	IDB_PORT_NAME,
	type PendingChildTabData,
	type ServerMessage,
	type UiMoveIntentData,
} from "@/src/idb-transport";

export type { PendingChildTabData, UiMoveIntentData };

import { log } from "../../../background/constants";

// ============================================================================
// Create IDBProxyClientTransport from Extension Transport
// ============================================================================
export interface TabCreatedEvent {
	tabId: number;
	openerTabId: number | undefined;
	tabIndex: number;
	decidedParentId: number | null;
	treeOrder: string;
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

export interface IDBTransportAdapterOptions {
	/** Called when connection state changes */
	onConnectionStateChange?: (
		state: "connecting" | "connected" | "disconnected",
	) => void;
	/** Called when connection is lost (will auto-retry) */
	onDisconnect?: () => void;
	/** Enable/disable the adapter. If false, will not connect and will disconnect if already connected */
	enabled?: boolean;
	/** Maximum retry attempts before giving up (-1 for infinite) */
	maxRetries?: number;
	/** Initial retry delay in ms (will exponentially backoff) */
	retryDelay?: number;
	/** Maximum retry delay in ms */
	maxRetryDelay?: number;
}

export interface IDBTransportAdapter {
	transport: IDBProxyClientTransport;
	resetDatabase: () => Promise<void>;
	sendMoveIntent: (moves: UiMoveIntentData[]) => Promise<void>;
	sendPendingChildIntent: (data: PendingChildTabData) => void;
	startManagedWindowMove: (tabIds: number[]) => Promise<void>;
	endManagedWindowMove: () => void;
	enableTestMode: () => void;
	injectBrowserEvent: (event: InjectBrowserEvent) => void;
	getTabCreatedEvents: () => Promise<TabCreatedEvent[]>;
	clearTabCreatedEvents: () => void;
	fetchFavicon: (url: string, requestId: string) => Promise<MaybeError<string>>;
	dispose: () => void;
	/** Get current connection state */
	getConnectionState: () => "connecting" | "connected" | "disconnected";
	/** Check if adapter is ready to use */
	isReady: () => boolean;
	/** Manually trigger a reconnection attempt */
	reconnect: () => void;
}

export function createIDBTransportAdapter(
	options: IDBTransportAdapterOptions = {},
): IDBTransportAdapter {
	const {
		enabled = true,
		maxRetries = -1, // infinite by default
		retryDelay = 100,
		maxRetryDelay = 5000,
		onConnectionStateChange,
		onDisconnect,
	} = options;

	// Connection state management
	let connectionState: "connecting" | "connected" | "disconnected" =
		"disconnected";
	let retryCount = 0;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let isDisposed = false;
	let currentExtensionTransport: ReturnType<
		typeof createExtensionClientTransport<ClientMessage, ServerMessage>
	> | null = null;

	// Pending operations
	const pendingRequests = new Map<
		string,
		{
			resolve: (response: IDBProxyResponse) => void;
			reject: (error: Error) => void;
		}
	>();
	const pendingMoveIntents = new Map<string, () => void>();
	const pendingFaviconRequests = new Map<
		string,
		(response: MaybeError<string>) => void
	>();
	let syncHandler: ((message: IDBProxySyncMessage) => void) | null = null;
	let resetResolve: (() => void) | null = null;
	let tabCreatedEventsResolve: ((events: TabCreatedEvent[]) => void) | null =
		null;

	const setConnectionState = (newState: typeof connectionState) => {
		if (connectionState !== newState) {
			connectionState = newState;
			log(`[Adapter] Connection state changed to: ${newState}`);
			onConnectionStateChange?.(newState);
		}
	};

	const clearRetryTimer = () => {
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
	};

	const scheduleReconnect = () => {
		if (!enabled || isDisposed) {
			return;
		}

		if (maxRetries >= 0 && retryCount >= maxRetries) {
			log("[Adapter] Max retries reached, giving up");
			setConnectionState("disconnected");
			return;
		}

		clearRetryTimer();

		// Exponential backoff with max delay
		const delay = Math.min(retryDelay * 2 ** retryCount, maxRetryDelay);
		retryCount++;

		log(`[Adapter] Scheduling reconnect attempt ${retryCount} in ${delay}ms`);
		retryTimer = setTimeout(() => {
			if (enabled && !isDisposed) {
				connect();
			}
		}, delay);
	};

	const handleMessageFromServer = (message: ServerMessage) => {
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
		} else if (message.type === "faviconResponse") {
			const resolve = pendingFaviconRequests.get(message.requestId);
			if (resolve) {
				if (message.error || message.dataUrl === null) {
					resolve(fail(message.error ?? "Failed to fetch favicon"));
				} else {
					resolve(success(message.dataUrl));
				}
				pendingFaviconRequests.delete(message.requestId);
			}
		} else if (message.type === "pong") {
			// Pong received, connection is alive
			if (connectionState === "connecting") {
				setConnectionState("connected");
				retryCount = 0; // Reset retry count on successful connection
			}
		}
	};

	const handleDisconnect = () => {
		console.log("[Sidepanel] Disconnected from background");
		setConnectionState("disconnected");

		// Reject all pending requests
		for (const pending of pendingRequests.values()) {
			pending.reject(new Error("Connection closed"));
		}
		pendingRequests.clear();

		// Resolve all pending move intents so they don't hang
		for (const resolve of pendingMoveIntents.values()) {
			resolve();
		}
		pendingMoveIntents.clear();

		// Resolve all pending favicon requests with error
		for (const resolve of pendingFaviconRequests.values()) {
			resolve(fail("Connection closed"));
		}
		pendingFaviconRequests.clear();

		// Notify callback
		onDisconnect?.();

		// Schedule reconnection if enabled and not disposed
		if (enabled && !isDisposed) {
			scheduleReconnect();
		}
	};

	let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

	const connect = () => {
		if (isDisposed || !enabled) {
			return;
		}

		// Clear any existing retry timer
		clearRetryTimer();

		// Dispose existing transport if any
		if (currentExtensionTransport) {
			try {
				currentExtensionTransport.dispose();
			} catch (e) {
				console.warn("[Adapter] Error disposing existing transport:", e);
			}
		}

		// Clear existing keepalive
		if (keepaliveInterval) {
			clearInterval(keepaliveInterval);
			keepaliveInterval = null;
		}

		log("[Adapter] Connecting to background...");
		setConnectionState("connecting");

		try {
			currentExtensionTransport = createExtensionClientTransport<
				ClientMessage,
				ServerMessage
			>({
				portName: IDB_PORT_NAME,
				onMessage: handleMessageFromServer,
				onDisconnect: handleDisconnect,
			});

			// Supplementary keepalive while sidebar is open (background also uses chrome.alarms when sidebar is closed)
			// Send ping every 20 seconds (service worker timeout is ~30s)
			keepaliveInterval = setInterval(() => {
				currentExtensionTransport?.send({ type: "ping" });
			}, 20000);

			// Send initial ping to verify connection
			currentExtensionTransport.send({ type: "ping" });
		} catch (error) {
			log("[Adapter] Connection failed:", error);
			handleDisconnect();
		}
	};

	const transport: IDBProxyClientTransport = {
		sendRequest: async (
			request: IDBProxyRequest,
		): Promise<IDBProxyResponse> => {
			if (!currentExtensionTransport || connectionState !== "connected") {
				throw new Error("Transport not connected");
			}
			const transport = currentExtensionTransport;
			return new Promise((resolve, reject) => {
				pendingRequests.set(request.id, { resolve, reject });
				transport.send({ type: "idbRequest", payload: request });
			});
		},
		onSync: (handler: (message: IDBProxySyncMessage) => void) => {
			syncHandler = handler;
		},
		dispose: () => {
			// Dispose is handled by the adapter's dispose method
		},
	};

	const resetDatabase = (): Promise<void> => {
		if (!currentExtensionTransport) {
			return Promise.reject(new Error("Transport not connected"));
		}
		const transport = currentExtensionTransport;
		return new Promise((resolve) => {
			resetResolve = resolve;
			transport.send({ type: "resetDatabase" });
		});
	};

	const sendMoveIntent = async (moves: UiMoveIntentData[]): Promise<void> => {
		if (!currentExtensionTransport) {
			return Promise.reject(new Error("Transport not connected"));
		}
		const transport = currentExtensionTransport;
		log("[Sidepanel] Sending move intent for", moves.length, "tabs");
		const requestId = `move-intent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

		return new Promise((resolve) => {
			pendingMoveIntents.set(requestId, resolve);
			transport.send({ type: "uiMoveIntent", requestId, moves });

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
		if (!currentExtensionTransport) return;
		console.log("[Sidepanel] Enabling test mode");
		currentExtensionTransport.send({ type: "enableTestMode" });
	};

	const getTabCreatedEvents = (): Promise<TabCreatedEvent[]> => {
		if (!currentExtensionTransport) {
			return Promise.reject(new Error("Transport not connected"));
		}
		const transport = currentExtensionTransport;
		return new Promise((resolve) => {
			tabCreatedEventsResolve = resolve;
			transport.send({ type: "getTabCreatedEvents" });
		});
	};

	const clearTabCreatedEvents = (): void => {
		if (!currentExtensionTransport) return;
		currentExtensionTransport.send({ type: "clearTabCreatedEvents" });
	};

	const injectBrowserEvent = (event: InjectBrowserEvent): void => {
		if (!currentExtensionTransport) return;
		currentExtensionTransport.send({ type: "injectBrowserEvent", event });
	};

	const startManagedWindowMove = async (tabIds: number[]): Promise<void> => {
		if (!currentExtensionTransport) {
			return Promise.reject(new Error("Transport not connected"));
		}
		log("[Sidepanel] Starting managed window move for", tabIds.length, "tabs");
		currentExtensionTransport.send({
			type: "startManagedWindowMove",
			tabIds,
		});
		// Give the background a delay to process the message and update its managed set
		// before we start calling browser.tabs.move(). This prevents the race condition where
		// onAttached fires before the background has added the tab to managedMoveTabIds.
		await new Promise((resolve) => setTimeout(resolve, 100));
	};

	const endManagedWindowMove = (): void => {
		if (!currentExtensionTransport) return;
		log("[Sidepanel] Ending managed window move");
		currentExtensionTransport.send({ type: "endManagedWindowMove" });
	};

	const sendPendingChildIntent = (data: PendingChildTabData): void => {
		if (!currentExtensionTransport) return;
		log("[Sidepanel] Sending pending child intent:", data);
		currentExtensionTransport.send({ type: "pendingChildTab", data });
	};

	const dispose = () => {
		log("[Adapter] Disposing adapter");
		isDisposed = true;
		clearRetryTimer();

		if (keepaliveInterval) {
			clearInterval(keepaliveInterval);
			keepaliveInterval = null;
		}

		if (currentExtensionTransport) {
			currentExtensionTransport.dispose();
			currentExtensionTransport = null;
		}

		pendingRequests.clear();
		pendingMoveIntents.clear();
		pendingFaviconRequests.clear();
		setConnectionState("disconnected");
	};

	const reconnect = () => {
		log("[Adapter] Manual reconnect triggered");
		retryCount = 0;
		connect();
	};

	const fetchFavicon = (
		url: string,
		requestId: string,
	): Promise<MaybeError<string>> => {
		if (!currentExtensionTransport) {
			return Promise.resolve(fail("Not connected"));
		}
		const transport = currentExtensionTransport;

		return new Promise((resolve) => {
			pendingFaviconRequests.set(requestId, resolve);
			transport.send({ type: "fetchFavicon", url, requestId });

			// Timeout fallback in case response is never received
			setTimeout(() => {
				const pending = pendingFaviconRequests.get(requestId);
				if (pending) {
					pending(fail("Timeout"));
					pendingFaviconRequests.delete(requestId);
				}
			}, 10000);
		});
	};

	const getConnectionState = () => connectionState;
	const isReady = () => connectionState === "connected";

	// Initialize connection if enabled
	if (enabled) {
		connect();
	}

	return {
		transport,
		resetDatabase,
		sendMoveIntent,
		sendPendingChildIntent,
		startManagedWindowMove,
		endManagedWindowMove,
		enableTestMode,
		injectBrowserEvent,
		getTabCreatedEvents,
		clearTabCreatedEvents,
		fetchFavicon,
		dispose,
		getConnectionState,
		isReady,
		reconnect,
	};
}
