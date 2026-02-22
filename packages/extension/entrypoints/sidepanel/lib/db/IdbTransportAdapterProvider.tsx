import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	createIDBTransportAdapter,
	type IDBTransportAdapter,
	type IDBTransportAdapterOptions,
} from "./createIDBTransportAdapter";

export interface UseIdbTransportAdapterOptions
	extends Omit<IDBTransportAdapterOptions, "onConnectionStateChange"> {
	/** Enable/disable the adapter. If false, will not connect and will disconnect if already connected */
	enabled?: boolean;
}

export interface UseIdbTransportAdapterResult {
	/** The adapter instance */
	adapter: IDBTransportAdapter | null;
	/** Whether the adapter is ready to use */
	isReady: boolean;
	/** Current connection state */
	connectionState: "connecting" | "connected" | "disconnected";
	/** Manually trigger a reconnection attempt */
	reconnect: () => void;
}

/**
 * Hook to manage the lifecycle of an IDB transport adapter.
 * Automatically handles initialization, cleanup, and connection state.
 */
export function useIdbTransportAdapter(
	options: UseIdbTransportAdapterOptions = {},
): UseIdbTransportAdapterResult {
	const { enabled, adapterOptions } = useMemo(() => {
		const { enabled = true, ...adapterOptions } = options;

		return { enabled, adapterOptions };
	}, [options]);

	const [connectionState, setConnectionState] = useState<
		"connecting" | "connected" | "disconnected"
	>("disconnected");
	const adapterRef = useRef<IDBTransportAdapter | null>(null);

	// Create or recreate adapter when enabled changes
	useEffect(() => {
		if (!enabled) {
			// Dispose existing adapter if disabled
			if (adapterRef.current) {
				if (import.meta.env?.DEV)
					console.log("[useIdbTransportAdapter] Disposing adapter (disabled)");
				adapterRef.current.dispose();
				adapterRef.current = null;
				setConnectionState("disconnected");
			}
			return;
		}

		// Create new adapter
		const adapter = createIDBTransportAdapter({
			...adapterOptions,
			enabled,
			onConnectionStateChange: (state) => {
				setConnectionState(state);
			},
		});

		adapterRef.current = adapter;
		setConnectionState(adapter.getConnectionState());

		// Cleanup on unmount or when enabled changes
		return () => {
			adapter.dispose();
			adapterRef.current = null;
		};
	}, [enabled, adapterOptions]); // Only recreate when enabled changes

	const reconnect = useMemo(
		() => () => {
			adapterRef.current?.reconnect();
		},
		[],
	);

	return useMemo(
		() => ({
			adapter: adapterRef.current,
			isReady: adapterRef.current?.isReady() ?? false,
			connectionState,
			reconnect,
		}),
		[connectionState, reconnect],
	);
}

/**
 * Context for the IDB transport adapter
 */
const IdbTransportAdapterContext =
	createContext<UseIdbTransportAdapterResult | null>(null);

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
			connectionState === "connecting"
				? "Connecting..."
				: connectionState === "disconnected"
					? "Reconnecting..."
					: "Loading...";

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
function useIdbTransportAdapterContext(): UseIdbTransportAdapterResult {
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
