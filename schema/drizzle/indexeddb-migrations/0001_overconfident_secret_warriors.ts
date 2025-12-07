import type { Migration } from "@firtoz/drizzle-indexeddb";

/**
 * Migration: overconfident secret warriors
 * Generated from: 0001_overconfident_secret_warriors
 */
export const migrate_0001: Migration = [
	{
		type: "createIndex",
		tableName: "tab",
		indexName: "tab_parent_id_index",
		keyPath: "parent_tab_id",
		unique: false,
	},
	{
		type: "createIndex",
		tableName: "tab",
		indexName: "tab_tree_order_index",
		keyPath: "tree_order",
		unique: false,
	},
];
