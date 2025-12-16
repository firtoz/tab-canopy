import type {
	IDBDatabaseLike,
	IDBProxySyncMessage,
} from "@firtoz/drizzle-indexeddb";
import { DB_NAME } from "./constants";

export type BroadcastSyncFn = (
	message: IDBProxySyncMessage,
	excludeClientId?: string,
) => void;

// Use generic to accept branded string IDs (e.g., string & { __brand: "tab_id" })
type RecordWithId<TId extends string = string> = { id: TId };
type RecordWithTimestamps = {
	createdAt: Date;
	updatedAt: Date;
};

export interface DbOperations {
	putItems: <TId extends string>(
		storeName: string,
		items: RecordWithId<TId>[],
	) => Promise<void>;
	deleteItems: (storeName: string, keys: string[]) => Promise<void>;
	getAll: <T>(storeName: string) => Promise<T[]>;
}

export const createDbOperations = (
	getDb: () => IDBDatabaseLike | null,
	getBroadcastSync: () => BroadcastSyncFn,
): DbOperations => {
	const putItems = async <TId extends string>(
		storeName: string,
		items: RecordWithId<TId>[],
	) => {
		const db = getDb();
		if (!db) return;

		// Get existing records to preserve createdAt timestamps
		const existingRecords = await Promise.all(
			items.map((item) =>
				db.get<RecordWithId<TId> & RecordWithTimestamps>(storeName, item.id),
			),
		);

		// Build a map of existing createdAt values
		// Handle both Date objects and legacy number timestamps
		const existingCreatedAt = new Map<TId, Date>();
		for (const record of existingRecords) {
			if (record?.createdAt) {
				// Convert number to Date if needed (for legacy data)
				const createdAt =
					record.createdAt instanceof Date
						? record.createdAt
						: new Date(record.createdAt as unknown as number);
				existingCreatedAt.set(record.id, createdAt);
			}
		}

		// Add timestamps to items (using Date objects for schema compatibility)
		const now = new Date();
		const itemsWithTimestamps = items.map((item) => ({
			...item,
			createdAt: existingCreatedAt.get(item.id) ?? now,
			updatedAt: now,
		}));

		await db.put(storeName, itemsWithTimestamps);

		// Broadcast the change
		getBroadcastSync()({
			dbName: DB_NAME,
			storeName,
			type: "sync:put",
			items: itemsWithTimestamps,
		});
	};

	const deleteItems = async (storeName: string, keys: string[]) => {
		const db = getDb();
		if (!db) return;
		await db.delete(storeName, keys);
		// Broadcast the change
		getBroadcastSync()({
			dbName: DB_NAME,
			storeName,
			type: "sync:delete",
			keys,
		});
	};

	const getAll = async <T>(storeName: string): Promise<T[]> => {
		const db = getDb();
		if (!db) return [];
		return db.getAll<T>(storeName);
	};

	return { putItems, deleteItems, getAll };
};
