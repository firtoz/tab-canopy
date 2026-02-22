import { TabManagerContent } from "./components/TabManagerContent";
import {
	IdbTransportAdapterProvider,
	type UseIdbTransportAdapterOptions,
} from "./lib/db/IdbTransportAdapterProvider";
import { MemoryCollectionProvider } from "./lib/db/MemoryCollectionProvider";

/**
 * Inner component: memory collections + sync from background.
 * Rendered once the adapter is ready (inside IdbTransportAdapterProvider).
 */
function AppContent() {
	return (
		<MemoryCollectionProvider>
			<TabManagerContent />
		</MemoryCollectionProvider>
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
