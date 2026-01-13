import {
	createProxyIDbCreator,
	DrizzleIndexedDBProvider,
	type IDBProxySyncMessage,
} from "@firtoz/drizzle-indexeddb";
import { useMemo } from "react";
import * as schema from "@/schema/src/schema";
import { TabManagerContent } from "./components/TabManagerContent";
import {
	IdbTransportAdapterProvider,
	type UseIdbTransportAdapterOptions,
	useIdbAdapter,
} from "./lib/db/IdbTransportAdapterProvider";

const DB_NAME = "tabcanopy.db";

/**
 * Inner component that uses the adapter from context.
 * This component is rendered once the adapter is ready.
 */
function AppContent() {
	const adapter = useIdbAdapter();

	// Create db creator and sync handler from adapter
	const { dbCreator, handleSyncReady } = useMemo(() => {
		const dbCreator = createProxyIDbCreator(adapter.transport);

		return {
			dbCreator,
			handleSyncReady: (handler: (message: IDBProxySyncMessage) => void) => {
				adapter.transport.onSync(handler);
			},
		};
	}, [adapter]);

	return (
		<DrizzleIndexedDBProvider
			dbName={DB_NAME}
			schema={schema}
			dbCreator={dbCreator}
			onSyncReady={handleSyncReady}
		>
			<TabManagerContent />
		</DrizzleIndexedDBProvider>
	);
}

function App() {
	const options: UseIdbTransportAdapterOptions = useMemo(() => {
		return {
			enabled: true,
			maxRetries: -1, // Infinite retries
			retryDelay: 100,
			maxRetryDelay: 5000,
		};
	}, []);

	return (
		<IdbTransportAdapterProvider options={options}>
			<AppContent />
		</IdbTransportAdapterProvider>
	);
}

export default App;
