import { syncableTable } from "@firtoz/drizzle-utils";
import { index, integer, text } from "drizzle-orm/sqlite-core";

/**
 * Browser window table
 */
export const windowTable = syncableTable(
	"window",
	{
		// Browser's window ID (not our primary key, but important for lookups)
		browserWindowId: integer("browser_window_id").notNull(),
		// Window state
		focused: integer("focused", { mode: "boolean" }).notNull().default(false),
		state: text("state"), // "normal" | "minimized" | "maximized" | "fullscreen"
		incognito: integer("incognito", { mode: "boolean" })
			.notNull()
			.default(false),
		// Window type
		type: text("type"), // "normal" | "popup" | "panel" | "devtools"
	},
	(t) => [
		index("window_browser_id_index").on(t.browserWindowId),
		index("window_focused_index").on(t.focused),
	],
);

/**
 * Browser tab table
 */
export const tabTable = syncableTable(
	"tab",
	{
		// Browser's tab ID
		browserTabId: integer("browser_tab_id").notNull(),
		// Browser's window ID (for quick lookups, denormalized)
		browserWindowId: integer("browser_window_id").notNull(),
		// Tab position in window (from browser)
		tabIndex: integer("tab_index").notNull(),
		// Tree structure fields
		parentTabId: integer("parent_tab_id"), // null = root level
		treeOrder: text("tree_order").notNull().default("a0"), // fractional indexing for sibling order
		isCollapsed: integer("is_collapsed", { mode: "boolean" })
			.notNull()
			.default(false),
		// Tab content
		title: text("title"),
		url: text("url"),
		favIconUrl: text("fav_icon_url"),
		// Tab state
		active: integer("active", { mode: "boolean" }).notNull().default(false),
		pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
		highlighted: integer("highlighted", { mode: "boolean" })
			.notNull()
			.default(false),
		discarded: integer("discarded", { mode: "boolean" })
			.notNull()
			.default(false),
		frozen: integer("frozen", { mode: "boolean" }).notNull().default(false),
		autoDiscardable: integer("auto_discardable", { mode: "boolean" })
			.notNull()
			.default(true),
		// Audio state
		audible: integer("audible", { mode: "boolean" }).notNull().default(false),
		mutedInfo: text("muted_info"), // JSON string of MutedInfo
		// Status
		status: text("status"), // "loading" | "complete"
		// Group
		groupId: integer("group_id"),
	},
	(t) => [
		index("tab_browser_id_index").on(t.browserTabId),
		index("tab_browser_window_id_index").on(t.browserWindowId),
		index("tab_index_index").on(t.tabIndex),
		index("tab_parent_id_index").on(t.parentTabId),
		index("tab_tree_order_index").on(t.treeOrder),
		index("tab_active_index").on(t.active),
		index("tab_audible_index").on(t.audible),
		index("tab_frozen_index").on(t.frozen),
	],
);

// Type exports
export type Window = typeof windowTable.$inferSelect;
export type InsertWindow = typeof windowTable.$inferInsert;
export type Tab = typeof tabTable.$inferSelect;
export type InsertTab = typeof tabTable.$inferInsert;
