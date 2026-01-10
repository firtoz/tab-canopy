import {
	createProxyDbCreator,
	DrizzleIndexedDBProvider,
	type IDBProxySyncMessage,
} from "@firtoz/drizzle-indexeddb";
import { useMemo } from "react";
import * as schema from "@/schema/src/schema";
import { TabManagerContent } from "./components/TabManagerContent";
import { IdbTransportAdapterProvider, useIdbAdapter } from "./lib/db";

const DB_NAME = "tabcanopy.db";

/**
 * Inner component that uses the adapter from context.
 * This component is rendered once the adapter is ready.
 */
function AppContent() {
	const adapter = useIdbAdapter();

	// Create db creator and sync handler from adapter
	const { dbCreator, handleSyncReady } = useMemo(() => {
		const dbCreator = createProxyDbCreator(adapter.transport);

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
	return (
		<IdbTransportAdapterProvider
			options={{
				enabled: true,
				maxRetries: -1, // Infinite retries
				retryDelay: 100,
				maxRetryDelay: 5000,
			}}
		>
			<AppContent />
		</IdbTransportAdapterProvider>
	);
}

export default App;
