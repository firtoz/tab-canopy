import type { SyncMessage } from "@firtoz/db-helpers";
import { memoryCollectionOptions } from "@firtoz/db-helpers";
import type { InferCollectionFromTable } from "@firtoz/drizzle-utils";
import { createCollection } from "@tanstack/db";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";
import type * as schema from "@/schema/src/schema";
import { useIdbAdapter } from "./IdbTransportAdapterProvider";
import {
	tabPassthroughSchema,
	windowPassthroughSchema,
} from "./memoryCollectionSchema";

type TabCollection = InferCollectionFromTable<typeof schema.tabTable>;
type WindowCollection = InferCollectionFromTable<typeof schema.windowTable>;

type SchemaType = {
	tabTable: typeof schema.tabTable;
	windowTable: typeof schema.windowTable;
};

export type MemoryCollectionContextValue = {
	getCollection: <T extends keyof SchemaType & string>(
		tableName: T,
	) => T extends "tabTable"
		? TabCollection
		: T extends "windowTable"
			? WindowCollection
			: never;
	incrementRefCount: (tableName: string) => void;
	decrementRefCount: (tableName: string) => void;
};

const MemoryCollectionContext =
	createContext<MemoryCollectionContextValue | null>(null);

export function MemoryCollectionProvider({
	children,
}: {
	children: ReactNode;
}) {
	const adapter = useIdbAdapter();
	const tabCollectionRef = useRef<TabCollection | null>(null);
	const windowCollectionRef = useRef<WindowCollection | null>(null);
	const refCounts = useRef({ tabTable: 0, windowTable: 0 });

	const tabCollection = useMemo(() => {
		if (tabCollectionRef.current) return tabCollectionRef.current;
		const col = createCollection(
			memoryCollectionOptions({
				id: "tab",
				schema: tabPassthroughSchema,
				getKey: (item) => (item as { id: string }).id,
			}),
		) as unknown as TabCollection;
		tabCollectionRef.current = col;
		return col;
	}, []);

	const windowCollection = useMemo(() => {
		if (windowCollectionRef.current) return windowCollectionRef.current;
		const col = createCollection(
			memoryCollectionOptions({
				id: "window",
				schema: windowPassthroughSchema,
				getKey: (item) => (item as { id: string }).id,
			}),
		) as unknown as WindowCollection;
		windowCollectionRef.current = col;
		return col;
	}, []);

	useEffect(() => {
		adapter.registerSyncHandler((storeName, messages) => {
			const typed = messages as SyncMessage<object, string | number>[];
			if (storeName === "tab") {
				tabCollection.utils.receiveSync(typed);
			} else {
				windowCollection.utils.receiveSync(typed);
			}
		});
	}, [adapter, tabCollection, windowCollection]);

	const getCollection = useCallback(
		<T extends keyof SchemaType & string>(
			tableName: T,
		): T extends "tabTable"
			? TabCollection
			: T extends "windowTable"
				? WindowCollection
				: never => {
			if (tableName === "tabTable") {
				return tabCollection as T extends "tabTable"
					? TabCollection
					: T extends "windowTable"
						? WindowCollection
						: never;
			}
			if (tableName === "windowTable") {
				return windowCollection as T extends "tabTable"
					? TabCollection
					: T extends "windowTable"
						? WindowCollection
						: never;
			}
			throw new Error(
				`Unknown table: ${tableName}. Use "tabTable" or "windowTable".`,
			);
		},
		[tabCollection, windowCollection],
	);

	const incrementRefCount = useCallback((tableName: string) => {
		if (tableName === "tabTable" || tableName === "windowTable") {
			refCounts.current[tableName]++;
		}
	}, []);

	const decrementRefCount = useCallback((tableName: string) => {
		if (tableName === "tabTable" || tableName === "windowTable") {
			refCounts.current[tableName]--;
		}
	}, []);

	const value = useMemo<MemoryCollectionContextValue>(
		() => ({
			getCollection,
			incrementRefCount,
			decrementRefCount,
		}),
		[getCollection, incrementRefCount, decrementRefCount],
	);

	return (
		<MemoryCollectionContext.Provider value={value}>
			{children}
		</MemoryCollectionContext.Provider>
	);
}

export function useMemoryCollection<T extends keyof SchemaType & string>(
	tableName: T,
): T extends "tabTable" ? TabCollection : WindowCollection {
	const context = useContext(MemoryCollectionContext);
	if (!context) {
		throw new Error(
			"useMemoryCollection must be used within MemoryCollectionProvider",
		);
	}
	const collection = context.getCollection(tableName);
	context.incrementRefCount(tableName);
	// Caller is responsible for decrement on unmount via useEffect in the hook that uses this
	// For simplicity we don't track ref count per hook instance here; the provider's refCounts are for optional cleanup
	return collection as T extends "tabTable" ? TabCollection : WindowCollection;
}

/** Returns useCollection that matches useDrizzleIndexedDB() API for drop-in replacement */
export function useTabcanopyDB(): {
	useCollection: <T extends keyof SchemaType & string>(
		tableName: T,
	) => T extends "tabTable" ? TabCollection : WindowCollection;
} {
	const context = useContext(MemoryCollectionContext);
	if (!context) {
		throw new Error(
			"useTabcanopyDB must be used within MemoryCollectionProvider",
		);
	}
	const useCollection = useCallback(
		<T extends keyof SchemaType & string>(tableName: T) => {
			const collection = context.getCollection(tableName);
			context.incrementRefCount(tableName);
			// Ref count decrement on unmount would require storing in a ref and useEffect cleanup - optional
			return collection as T extends "tabTable"
				? TabCollection
				: WindowCollection;
		},
		[context],
	);
	return { useCollection };
}
