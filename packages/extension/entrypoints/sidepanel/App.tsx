import {
	createProxyDbCreator,
	DrizzleIndexedDBProvider,
	type IDBProxySyncMessage,
} from "@firtoz/drizzle-indexeddb";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import * as schema from "@/schema/src/schema";
import { TabManagerContent } from "./components/TabManagerContent";
import { createIDBTransportAdapter } from "./lib/db/createIDBTransportAdapter";

const DB_NAME = "tabcanopy.db";

// ============================================================================
// Background API Context - consolidated context for background communication
// ============================================================================

import type { UiMoveIntentData } from "@/src/idb-transport";

interface BackgroundApi {
	resetDatabase: () => Promise<void>;
	sendMoveIntent: (moves: UiMoveIntentData[]) => Promise<void>;
	managedWindowMove: {
		start: (tabIds: number[]) => Promise<void>;
		end: () => void;
	};
}

const BackgroundApiContext = createContext<BackgroundApi | null>(null);

export const useResetDatabase = () => {
	const ctx = useContext(BackgroundApiContext);
	if (!ctx) {
		throw new Error("useResetDatabase must be used within App");
	}
	return ctx.resetDatabase;
};

export const useSendMoveIntent = () => {
	const ctx = useContext(BackgroundApiContext);
	if (!ctx) {
		throw new Error("useSendMoveIntent must be used within App");
	}
	return ctx.sendMoveIntent;
};

export const useManagedWindowMove = () => {
	const ctx = useContext(BackgroundApiContext);
	if (!ctx) {
		throw new Error("useManagedWindowMove must be used within App");
	}
	return ctx.managedWindowMove;
};

// ============================================================================
// Test Actions Context (for test helpers)
// ============================================================================

import type { TabCreatedEvent } from "./lib/db/createIDBTransportAdapter";

export interface TestActions {
	enableTestMode: () => void;
	injectBrowserEvent: (
		event: import("./lib/db/createIDBTransportAdapter").InjectBrowserEvent,
	) => void;
	getTabCreatedEvents: () => Promise<TabCreatedEvent[]>;
	clearTabCreatedEvents: () => void;
}

const TestActionsContext = createContext<TestActions | null>(null);

export const useTestActions = () => {
	const ctx = useContext(TestActionsContext);
	if (!ctx) {
		throw new Error("useTestActions must be used within App");
	}
	return ctx;
};

// ============================================================================
// Main App with Provider
// ============================================================================

function App() {
	const [isReady, setIsReady] = useState(false);
	const [connectionKey, setConnectionKey] = useState(0);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const prevAdapterRef = useRef<ReturnType<
		typeof createIDBTransportAdapter
	> | null>(null);

	// Create transport adapter - only when connectionKey changes
	const {
		dbCreator,
		handleSyncReady,
		resetDatabase,
		sendMoveIntent,
		startManagedWindowMove,
		endManagedWindowMove,
		enableTestMode,
		injectBrowserEvent,
		getTabCreatedEvents,
		clearTabCreatedEvents,
	} = useMemo(() => {
		// Clean up previous adapter if it exists
		if (prevAdapterRef.current) {
			console.log("[App] Disposing previous adapter");
			try {
				prevAdapterRef.current.dispose();
			} catch (e) {
				console.warn("[App] Error disposing adapter:", e);
			}
		}

		console.log(
			"[App] Creating new adapter (connectionKey:",
			connectionKey,
			")",
		);
		const adapter = createIDBTransportAdapter({
			onDisconnect: () => {
				console.log("[App] Connection lost, will reconnect");
				setIsReady(false);

				// Clear any existing reconnect timer
				if (reconnectTimerRef.current) {
					clearTimeout(reconnectTimerRef.current);
				}

				// Debounce reconnection to avoid rapid reconnects during HMR
				reconnectTimerRef.current = setTimeout(() => {
					console.log("[App] Triggering reconnection");
					setConnectionKey((prev) => prev + 1);
				}, 100);
			},
		});

		prevAdapterRef.current = adapter;
		const dbCreator = createProxyDbCreator(adapter.transport);

		return {
			dbCreator,
			handleSyncReady: (handler: (message: IDBProxySyncMessage) => void) => {
				adapter.transport.onSync(handler);
			},
			resetDatabase: adapter.resetDatabase,
			sendMoveIntent: adapter.sendMoveIntent,
			startManagedWindowMove: adapter.startManagedWindowMove,
			endManagedWindowMove: adapter.endManagedWindowMove,
			enableTestMode: adapter.enableTestMode,
			injectBrowserEvent: adapter.injectBrowserEvent,
			getTabCreatedEvents: adapter.getTabCreatedEvents,
			clearTabCreatedEvents: adapter.clearTabCreatedEvents,
		};
	}, [connectionKey]);

	const backgroundApiValue = useMemo<BackgroundApi>(
		() => ({
			resetDatabase,
			sendMoveIntent,
			managedWindowMove: {
				start: startManagedWindowMove,
				end: endManagedWindowMove,
			},
		}),
		[
			resetDatabase,
			sendMoveIntent,
			startManagedWindowMove,
			endManagedWindowMove,
		],
	);

	const testActionsValue = useMemo<TestActions>(
		() => ({
			enableTestMode,
			injectBrowserEvent,
			getTabCreatedEvents,
			clearTabCreatedEvents,
		}),
		[
			enableTestMode,
			injectBrowserEvent,
			getTabCreatedEvents,
			clearTabCreatedEvents,
		],
	);

	useEffect(() => {
		// Small delay to ensure connection is established
		const timer = setTimeout(() => {
			setIsReady(true);
		}, 50);

		return () => {
			clearTimeout(timer);
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current);
			}
			// Only dispose on unmount, not on connectionKey change
			// (disposal is handled in the ref logic above)
		};
	}, []);

	if (!isReady) {
		return <div className="p-4 text-center text-zinc-500">Connecting...</div>;
	}

	return (
		<BackgroundApiContext.Provider value={backgroundApiValue}>
			<TestActionsContext.Provider value={testActionsValue}>
				<DrizzleIndexedDBProvider
					key={connectionKey}
					dbName={DB_NAME}
					schema={schema}
					dbCreator={dbCreator}
					onSyncReady={handleSyncReady}
				>
					<TabManagerContent />
				</DrizzleIndexedDBProvider>
			</TestActionsContext.Provider>
		</BackgroundApiContext.Provider>
	);
}

export default App;
