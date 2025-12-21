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
import { DevToolsPanel, DevToolsToggle } from "./components/DevToolsPanel";
import { TabManagerContent } from "./components/TabManagerContent";
import { createIDBTransportAdapter } from "./createIDBTransportAdapter";
import { DevToolsProvider } from "./lib/devtools";

const DB_NAME = "tabcanopy.db";

// ============================================================================
// Reset Database Context
// ============================================================================

const ResetDatabaseContext = createContext<(() => Promise<void>) | null>(null);

export const useResetDatabase = () => {
	const resetDatabase = useContext(ResetDatabaseContext);
	if (!resetDatabase) {
		throw new Error("useResetDatabase must be used within App");
	}
	return resetDatabase;
};

// ============================================================================
// Send Move Intent Context (for UI to tell background about pending moves)
// ============================================================================

import type { UiMoveIntentData } from "@/src/idb-transport";

const SendMoveIntentContext = createContext<
	((moves: UiMoveIntentData[]) => void) | null
>(null);

export const useSendMoveIntent = () => {
	const sendMoveIntent = useContext(SendMoveIntentContext);
	if (!sendMoveIntent) {
		throw new Error("useSendMoveIntent must be used within App");
	}
	return sendMoveIntent;
};

// ============================================================================
// State Getter Context (for DevTools to get current state)
// ============================================================================

type StateGetter = () => { windows: schema.Window[]; tabs: schema.Tab[] };
const StateGetterContext = createContext<{
	setGetter: (fn: StateGetter) => void;
} | null>(null);

export const useRegisterStateGetter = () => {
	const ctx = useContext(StateGetterContext);
	if (!ctx) {
		throw new Error("useRegisterStateGetter must be used within App");
	}
	return ctx.setGetter;
};

// ============================================================================
// Test Actions Context (for test helpers)
// ============================================================================

import type { TabCreatedEvent } from "./createIDBTransportAdapter";

export interface TestActions {
	enableTestMode: () => void;
	injectBrowserEvent: (
		event: import("./createIDBTransportAdapter").InjectBrowserEvent,
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
	const stateGetterRef = useRef<StateGetter>(() => ({ windows: [], tabs: [] }));
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
			enableTestMode: adapter.enableTestMode,
			injectBrowserEvent: adapter.injectBrowserEvent,
			getTabCreatedEvents: adapter.getTabCreatedEvents,
			clearTabCreatedEvents: adapter.clearTabCreatedEvents,
		};
	}, [connectionKey]);

	const stateGetterContextValue = useMemo(
		() => ({
			setGetter: (fn: StateGetter) => {
				stateGetterRef.current = fn;
			},
		}),
		[],
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

	const getCurrentState = useMemo(() => {
		return () => stateGetterRef.current();
	}, []);

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
		<ResetDatabaseContext.Provider value={resetDatabase}>
			<SendMoveIntentContext.Provider value={sendMoveIntent}>
				<TestActionsContext.Provider value={testActionsValue}>
					<StateGetterContext.Provider value={stateGetterContextValue}>
						<DevToolsProvider getCurrentState={getCurrentState}>
							<DrizzleIndexedDBProvider
								key={connectionKey}
								dbName={DB_NAME}
								schema={schema}
								dbCreator={dbCreator}
								onSyncReady={handleSyncReady}
							>
								<TabManagerContent />
								<DevToolsPanel />
								<DevToolsToggle />
							</DrizzleIndexedDBProvider>
						</DevToolsProvider>
					</StateGetterContext.Provider>
				</TestActionsContext.Provider>
			</SendMoveIntentContext.Provider>
		</ResetDatabaseContext.Provider>
	);
}

export default App;
