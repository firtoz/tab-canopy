import { useEffect, useMemo, useRef, useState } from "react";
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
	const { enabled = true, ...adapterOptions } = options;
	const [connectionState, setConnectionState] = useState<
		"connecting" | "connected" | "disconnected"
	>("disconnected");
	const adapterRef = useRef<IDBTransportAdapter | null>(null);

	// Create or recreate adapter when enabled changes
	useEffect(() => {
		if (!enabled) {
			// Dispose existing adapter if disabled
			if (adapterRef.current) {
				console.log("[useIdbTransportAdapter] Disposing adapter (disabled)");
				adapterRef.current.dispose();
				adapterRef.current = null;
				setConnectionState("disconnected");
			}
			return;
		}

		// Create new adapter
		console.log("[useIdbTransportAdapter] Creating adapter");
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
			console.log("[useIdbTransportAdapter] Disposing adapter (unmount/disabled)");
			adapter.dispose();
			adapterRef.current = null;
		};
	}, [enabled]); // Only recreate when enabled changes

	const reconnect = () => {
		adapterRef.current?.reconnect();
	};

	return useMemo(
		() => ({
			adapter: adapterRef.current,
			isReady: adapterRef.current?.isReady() ?? false,
			connectionState,
			reconnect,
		}),
		[connectionState],
	);
}
