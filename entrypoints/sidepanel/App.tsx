import {
	createProxyDbCreator,
	DrizzleIndexedDBProvider,
	type IDBProxySyncMessage,
} from "@firtoz/drizzle-indexeddb";
import { useEffect, useMemo, useRef, useState } from "react";
import * as schema from "@/schema/src/schema";
import { TabManagerContent } from "./components/TabManagerContent";
import { createIDBTransportAdapter } from "./createIDBTransportAdapter";

const DB_NAME = "tabcanopy.db";

// ============================================================================
// Main App with Provider
// ============================================================================

function App() {
	const [isReady, setIsReady] = useState(false);
	const adapterRef = useRef<ReturnType<
		typeof createIDBTransportAdapter
	> | null>(null);

	// Create transport adapter
	const { dbCreator, handleSyncReady } = useMemo(() => {
		const adapter = createIDBTransportAdapter();
		adapterRef.current = adapter;

		const dbCreator = createProxyDbCreator(adapter.transport);

		return {
			dbCreator,
			handleSyncReady: (handler: (message: IDBProxySyncMessage) => void) => {
				adapter.transport.onSync(handler);
			},
		};
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

export default App;
