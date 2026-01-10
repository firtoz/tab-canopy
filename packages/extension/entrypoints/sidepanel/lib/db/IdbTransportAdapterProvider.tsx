import {
	createContext,
	useContext,
	type ReactNode,
} from "react";
import {
	useIdbTransportAdapter,
	type UseIdbTransportAdapterOptions,
	type UseIdbTransportAdapterResult,
} from "./useIdbTransportAdapter";
import type { IDBTransportAdapter } from "./createIDBTransportAdapter";

/**
 * Context for the IDB transport adapter
 */
const IdbTransportAdapterContext = createContext<UseIdbTransportAdapterResult | null>(null);

export interface IdbTransportAdapterProviderProps {
	children: ReactNode | ((adapter: IDBTransportAdapter) => ReactNode);
	options?: UseIdbTransportAdapterOptions;
	/** Loading component to show while connecting */
	loadingComponent?: ReactNode;
}

/**
 * Provider for the IDB transport adapter.
 * Manages the adapter lifecycle and provides it via context.
 * 
 * @example Basic usage
 * ```tsx
 * <IdbTransportAdapterProvider>
 *   {(adapter) => (
 *     <MyComponent />
 *   )}
 * </IdbTransportAdapterProvider>
 * ```
 * 
 * @example With options
 * ```tsx
 * <IdbTransportAdapterProvider
 *   options={{ maxRetries: 5, retryDelay: 200 }}
 *   loadingComponent={<div>Connecting...</div>}
 * >
 *   <MyComponent />
 * </IdbTransportAdapterProvider>
 * ```
 */
export function IdbTransportAdapterProvider({
	children,
	options,
	loadingComponent,
}: IdbTransportAdapterProviderProps) {
	const result = useIdbTransportAdapter(options);
	const { adapter, isReady, connectionState } = result;

	// Show loading state while connecting
	if (!isReady || !adapter) {
		if (loadingComponent) {
			return <>{loadingComponent}</>;
		}

		const message = 
			connectionState === "connecting" ? "Connecting..." :
			connectionState === "disconnected" ? "Reconnecting..." :
			"Loading...";
		
		return <div className="p-4 text-center text-zinc-500">{message}</div>;
	}

	return (
		<IdbTransportAdapterContext.Provider value={result}>
			{typeof children === "function" ? children(adapter) : children}
		</IdbTransportAdapterContext.Provider>
	);
}

/**
 * Hook to access the IDB transport adapter from context.
 * Must be used within IdbTransportAdapterProvider.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { adapter, isReady, connectionState } = useIdbTransportAdapterContext();
 *   
 *   // Use adapter methods
 *   const handleReset = () => adapter.resetDatabase();
 *   
 *   return <button onClick={handleReset}>Reset DB</button>;
 * }
 * ```
 */
export function useIdbTransportAdapterContext(): UseIdbTransportAdapterResult {
	const context = useContext(IdbTransportAdapterContext);
	if (!context) {
		throw new Error(
			"useIdbTransportAdapterContext must be used within IdbTransportAdapterProvider",
		);
	}
	return context;
}

/**
 * Hook to access the IDB transport adapter instance directly.
 * Must be used within IdbTransportAdapterProvider.
 * Throws if adapter is not ready.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const adapter = useIdbAdapter();
 *   
 *   // Access adapter directly
 *   adapter.testActions.enableTestMode();
 *   adapter.resetDatabase();
 *   
 *   return <div>...</div>;
 * }
 * ```
 */
export function useIdbAdapter(): IDBTransportAdapter {
	const { adapter } = useIdbTransportAdapterContext();
	if (!adapter) {
		throw new Error("IDB adapter is not ready");
	}
	return adapter;
}
