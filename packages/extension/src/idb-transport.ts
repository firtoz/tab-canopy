/**
 * Generic browser extension transport using chrome.runtime ports.
 * Fully typed with discriminated unions for client and server messages.
 */

import { pack, unpack } from "msgpackr";
import { browser } from "wxt/browser";

/**
 * Base message wrapper for port communication
 */
type PortMessage<TClientMsg, TServerMsg> =
	| { direction: "toServer"; payload: TClientMsg }
	| { direction: "toClient"; payload: TServerMsg };

/**
 * Client info passed to server message handlers
 */
export interface ClientInfo {
	clientId: string;
	port: Browser.runtime.Port;
}

/**
 * Server transport options
 */
export interface ExtensionServerTransportOptions<TClientMsg, TServerMsg> {
	/** Port name to listen on */
	portName: string;
	/** Handle incoming messages from clients */
	onMessage: (
		message: TClientMsg,
		client: ClientInfo,
		broadcast: (msg: TServerMsg, excludeClientId?: string) => void,
	) => void;
	/** Called when a client connects */
	onConnect?: (client: ClientInfo) => void;
	/** Called when a client disconnects */
	onDisconnect?: (clientId: string) => void;
}

/**
 * Server transport instance
 */
export interface ExtensionServerTransport<TServerMsg> {
	/** Broadcast a message to all connected clients */
	broadcast: (message: TServerMsg, excludeClientId?: string) => void;
	/** Send a message to a specific client */
	send: (clientId: string, message: TServerMsg) => void;
	/** Get the number of connected clients */
	getClientCount: () => number;
	/** Get all connected client IDs */
	getClientIds: () => string[];
	/** Dispose and disconnect all clients */
	dispose: () => void;
}

/**
 * Create a server transport for background script.
 */
export function createExtensionServerTransport<TClientMsg, TServerMsg>(
	options: ExtensionServerTransportOptions<TClientMsg, TServerMsg>,
): ExtensionServerTransport<TServerMsg> {
	const { portName, onMessage, onConnect, onDisconnect } = options;
	const connectedClients = new Map<string, Browser.runtime.Port>();

	// Helper to broadcast to clients
	const broadcast = (message: TServerMsg, excludeClientId?: string) => {
		const portMessage: PortMessage<TClientMsg, TServerMsg> = {
			direction: "toClient",
			payload: message,
		};
		for (const [clientId, port] of connectedClients) {
			if (clientId !== excludeClientId) {
				try {
					port.postMessage([...pack(portMessage)]);
				} catch (e) {
					console.error(`[Server] Failed to send to ${clientId}:`, e);
					connectedClients.delete(clientId);
				}
			}
		}
	};

	// Helper to send to specific client
	const send = (clientId: string, message: TServerMsg) => {
		const port = connectedClients.get(clientId);
		if (port) {
			const portMessage: PortMessage<TClientMsg, TServerMsg> = {
				direction: "toClient",
				payload: message,
			};
			try {
				port.postMessage([...pack(portMessage)]);
			} catch (e) {
				console.error(`[Server] Failed to send to ${clientId}:`, e);
				connectedClients.delete(clientId);
			}
		}
	};

	// Listen for new connections
	browser.runtime.onConnect.addListener((port) => {
		if (port.name !== portName) return;

		const clientId =
			port.sender?.documentId ??
			`client-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

		if (import.meta.env?.DEV)
			console.log(`[Server] Client connected: ${clientId}`);
		connectedClients.set(clientId, port);

		const clientInfo: ClientInfo = { clientId, port };
		onConnect?.(clientInfo);

		// Handle messages from this client
		port.onMessage.addListener((packed: Array<number>) => {
			const message = unpack(new Uint8Array(packed)) as PortMessage<
				TClientMsg,
				TServerMsg
			>;

			if (message.direction === "toServer") {
				onMessage(message.payload, clientInfo, broadcast);
			}
		});

		// Clean up on disconnect
		port.onDisconnect.addListener(() => {
			if (import.meta.env?.DEV)
				console.log(`[Server] Client disconnected: ${clientId}`);
			connectedClients.delete(clientId);
			onDisconnect?.(clientId);
		});
	});

	return {
		broadcast,
		send,
		getClientCount: () => connectedClients.size,
		getClientIds: () => Array.from(connectedClients.keys()),
		dispose: () => {
			for (const port of connectedClients.values()) {
				port.disconnect();
			}
			connectedClients.clear();
		},
	};
}

/**
 * Client transport options
 */
export interface ExtensionClientTransportOptions<TServerMsg> {
	/** Port name to connect to */
	portName: string;
	/** Handle incoming messages from server */
	onMessage: (message: TServerMsg) => void;
	/** Called when disconnected from server */
	onDisconnect?: () => void;
}

/**
 * Client transport instance
 */
export interface ExtensionClientTransport<TClientMsg> {
	/** Send a message to the server */
	send: (message: TClientMsg) => void;
	/** Get the underlying port */
	getPort: () => Browser.runtime.Port;
	/** Disconnect from the server */
	dispose: () => void;
}

/**
 * Create a client transport for sidepanel/popup/options pages.
 */
export function createExtensionClientTransport<TClientMsg, TServerMsg>(
	options: ExtensionClientTransportOptions<TServerMsg>,
): ExtensionClientTransport<TClientMsg> {
	const { portName, onMessage, onDisconnect } = options;
	const port = browser.runtime.connect({ name: portName });
	let isDisconnected = false;

	// Handle messages from server
	port.onMessage.addListener((packed: Uint8Array) => {
		const message = unpack(new Uint8Array(packed)) as PortMessage<
			TClientMsg,
			TServerMsg
		>;

		if (message.direction === "toClient") {
			onMessage(message.payload);
		}
	});

	// Handle disconnection
	port.onDisconnect.addListener(() => {
		if (import.meta.env?.DEV) console.log("[Client] Disconnected from server");
		isDisconnected = true;
		onDisconnect?.();
	});

	return {
		send: (message: TClientMsg) => {
			if (isDisconnected) {
				if (import.meta.env?.DEV)
					console.warn("[Client] Attempted to send on disconnected port");
				return;
			}

			const portMessage: PortMessage<TClientMsg, TServerMsg> = {
				direction: "toServer",
				payload: message,
			};

			try {
				port.postMessage([...pack(portMessage)]);
			} catch (e) {
				if (e instanceof Error && e.message.includes("disconnected port")) {
					if (import.meta.env?.DEV)
						console.warn("[Client] Port disconnected during send");
					isDisconnected = true;
				} else {
					throw e;
				}
			}
		},
		getPort: () => port,
		dispose: () => {
			if (import.meta.env?.DEV) console.log("[Client] Disposing transport");
			if (!isDisconnected) {
				try {
					port.disconnect();
				} catch (e) {
					if (import.meta.env?.DEV)
						console.warn("[Client] Error disconnecting port:", e);
				}
			}
		},
	};
}

// ============================================================================
// Sync and message types
// ============================================================================

import type { SyncMessage } from "@firtoz/db-helpers";

/**
 * UI move intent for preventing race conditions
 */
export interface UiMoveIntentData {
	tabId: number;
	parentTabId: number | null;
	treeOrder: string;
}

export interface TabCreatedEvent {
	tabId: number;
	openerTabId: number | undefined;
	tabIndex: number;
	decidedParentId: number | null;
	treeOrder: string;
	reason: string;
	timestamp: number;
}

/**
 * Generic browser event injection for testing
 * Allows tests to inject fake browser events to test event handlers
 * Using discriminated unions for type safety
 */
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

/**
 * Pending child tab intent - used before creating a tab to tell background
 * what the intended parent should be (since Chrome doesn't propagate openerTabId)
 */
export interface PendingChildTabData {
	windowId: number;
	expectedIndex: number;
	parentTabId: number;
	treeOrder: string;
}

/**
 * Messages sent from client to server
 */
export type ClientMessage =
	| { type: "broadcast"; channel: string; data: unknown }
	| { type: "resetDatabase" }
	| { type: "uiMoveIntent"; requestId: string; moves: UiMoveIntentData[] }
	| { type: "pendingChildTab"; data: PendingChildTabData }
	| { type: "startManagedWindowMove"; tabIds: number[] }
	| { type: "endManagedWindowMove" }
	| { type: "getTabCreatedEvents" }
	| { type: "clearTabCreatedEvents" }
	| { type: "enableTestMode" }
	| { type: "disableTestMode" }
	| { type: "injectBrowserEvent"; event: InjectBrowserEvent }
	| { type: "fetchFavicon"; url: string; requestId: string }
	| { type: "ping" }
	| { type: "patchTab"; tabId: number; patch: { titleOverride: string | null } }
	| {
			type: "patchWindow";
			windowId: number;
			patch: { titleOverride: string | null };
	  };

/**
 * Messages sent from server to client
 */
export type ServerMessage =
	| { type: "sync"; storeName: "tab" | "window"; messages: SyncMessage[] }
	| {
			type: "broadcast";
			channel: string;
			data: unknown;
			fromClientId?: string;
	  }
	| { type: "resetDatabaseComplete" }
	| { type: "uiMoveIntentAck"; requestId: string }
	| { type: "tabCreatedEvents"; events: TabCreatedEvent[] }
	| {
			type: "faviconResponse";
			requestId: string;
			dataUrl: string | null;
			error?: string;
	  }
	| { type: "pong" };

/** Port name for the transport */
export const IDB_PORT_NAME = "tabcanopy";
