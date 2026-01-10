/**
 * IDB Transport Adapter - Main exports
 * 
 * This module provides a robust IDB transport adapter with automatic connection
 * management, retry logic, and proper lifecycle handling.
 * 
 * @example Basic usage with provider
 * ```tsx
 * import { IdbTransportAdapterProvider, useIdbAdapter } from "./lib/db";
 * 
 * function App() {
 *   return (
 *     <IdbTransportAdapterProvider>
 *       <MyComponent />
 *     </IdbTransportAdapterProvider>
 *   );
 * }
 * 
 * function MyComponent() {
 *   const adapter = useIdbAdapter();
 *   adapter.enableTestMode();
 *   return <div>...</div>;
 * }
 * ```
 */

// Main adapter factory and types
export {
	createIDBTransportAdapter,
	type IDBTransportAdapter,
	type IDBTransportAdapterOptions,
	type TabCreatedEvent,
	type InjectBrowserEvent,
} from "./createIDBTransportAdapter";

// React hook for adapter lifecycle
export {
	useIdbTransportAdapter,
	type UseIdbTransportAdapterOptions,
	type UseIdbTransportAdapterResult,
} from "./useIdbTransportAdapter";

// Provider and context hooks (recommended)
export {
	IdbTransportAdapterProvider,
	useIdbTransportAdapterContext,
	useIdbAdapter,
	type IdbTransportAdapterProviderProps,
} from "./IdbTransportAdapterProvider";
