import type { Migration } from "@firtoz/drizzle-indexeddb";

/**
 * Migration: silent revanche
 * Generated from: 0000_silent_revanche
 */
export const migrate_0000: Migration = [
	{
		"type": "createTable",
		"name": "tab",
		"keyPath": "id",
		"autoIncrement": false,
		"indexes": [
			{
				"name": "tab_browser_id_index",
				"keyPath": "browser_tab_id",
				"unique": false
			},
			{
				"name": "tab_browser_window_id_index",
				"keyPath": "browser_window_id",
				"unique": false
			},
			{
				"name": "tab_index_index",
				"keyPath": "tab_index",
				"unique": false
			},
			{
				"name": "tab_active_index",
				"keyPath": "active",
				"unique": false
			},
			{
				"name": "tab_audible_index",
				"keyPath": "audible",
				"unique": false
			},
			{
				"name": "tab_frozen_index",
				"keyPath": "frozen",
				"unique": false
			}
		]
	},
	{
		"type": "createTable",
		"name": "window",
		"keyPath": "id",
		"autoIncrement": false,
		"indexes": [
			{
				"name": "window_browser_id_index",
				"keyPath": "browser_window_id",
				"unique": false
			},
			{
				"name": "window_focused_index",
				"keyPath": "focused",
				"unique": false
			}
		]
	}
];