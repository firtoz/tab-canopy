import type { Migration } from "@firtoz/drizzle-indexeddb";

/**
 * Migration: parched phil sheldon
 * Generated from: 0000_parched_phil_sheldon
 */
export const migrate_0000: Migration = [
	{
		"type": "createTable",
		"name": "todo",
		"keyPath": "id",
		"autoIncrement": false,
		"indexes": [
			{
				"name": "todo_user_id_index",
				"keyPath": "user_id",
				"unique": false
			},
			{
				"name": "todo_parent_id_index",
				"keyPath": "parent_id",
				"unique": false
			},
			{
				"name": "todo_completed_index",
				"keyPath": "completed",
				"unique": false
			},
			{
				"name": "todo_created_at_index",
				"keyPath": "createdAt",
				"unique": false
			},
			{
				"name": "todo_updated_at_index",
				"keyPath": "updatedAt",
				"unique": false
			},
			{
				"name": "todo_deleted_at_index",
				"keyPath": "deletedAt",
				"unique": false
			},
			{
				"name": "todo_priority_index",
				"keyPath": "priority",
				"unique": false
			},
			{
				"name": "todo_status_index",
				"keyPath": "status",
				"unique": false
			}
		]
	},
	{
		"type": "createTable",
		"name": "user",
		"keyPath": "id",
		"autoIncrement": false,
		"indexes": [
			{
				"name": "email_index",
				"keyPath": "email",
				"unique": false
			}
		]
	}
];