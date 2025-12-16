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
// Main App with Provider
// ============================================================================

function App() {
	const [isReady, setIsReady] = useState(false);
	const adapterRef = useRef<ReturnType<
		typeof createIDBTransportAdapter
	> | null>(null);
	const stateGetterRef = useRef<StateGetter>(() => ({ windows: [], tabs: [] }));

	// Create transport adapter
	const { dbCreator, handleSyncReady, resetDatabase, sendMoveIntent } =
		useMemo(() => {
			const adapter = createIDBTransportAdapter();
			adapterRef.current = adapter;

			const dbCreator = createProxyDbCreator(adapter.transport);

			return {
				dbCreator,
				handleSyncReady: (handler: (message: IDBProxySyncMessage) => void) => {
					adapter.transport.onSync(handler);
				},
				resetDatabase: adapter.resetDatabase,
				sendMoveIntent: adapter.sendMoveIntent,
			};
		}, []);

	const stateGetterContextValue = useMemo(
		() => ({
			setGetter: (fn: StateGetter) => {
				stateGetterRef.current = fn;
			},
		}),
		[],
	);

	const getCurrentState = useMemo(() => {
		return () => stateGetterRef.current();
	}, []);

	useEffect(() => {
		setIsReady(true);
		return () => {
			adapterRef.current?.dispose();
		};
	}, []);

	if (!isReady) {
		return <div className="p-4 text-center text-zinc-500">Connecting...</div>;
	}

	return (
		<ResetDatabaseContext.Provider value={resetDatabase}>
			<SendMoveIntentContext.Provider value={sendMoveIntent}>
				<StateGetterContext.Provider value={stateGetterContextValue}>
					<DevToolsProvider getCurrentState={getCurrentState}>
						<DrizzleIndexedDBProvider
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
			</SendMoveIntentContext.Provider>
		</ResetDatabaseContext.Provider>
	);
}

export default App;
