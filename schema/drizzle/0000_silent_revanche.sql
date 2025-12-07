CREATE TABLE `tab` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`deletedAt` integer,
	`browser_tab_id` integer NOT NULL,
	`browser_window_id` integer NOT NULL,
	`tab_index` integer NOT NULL,
	`title` text,
	`url` text,
	`fav_icon_url` text,
	`active` integer DEFAULT false NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`highlighted` integer DEFAULT false NOT NULL,
	`discarded` integer DEFAULT false NOT NULL,
	`frozen` integer DEFAULT false NOT NULL,
	`auto_discardable` integer DEFAULT true NOT NULL,
	`audible` integer DEFAULT false NOT NULL,
	`muted_info` text,
	`status` text,
	`group_id` integer
);
--> statement-breakpoint
CREATE INDEX `tab_browser_id_index` ON `tab` (`browser_tab_id`);--> statement-breakpoint
CREATE INDEX `tab_browser_window_id_index` ON `tab` (`browser_window_id`);--> statement-breakpoint
CREATE INDEX `tab_index_index` ON `tab` (`tab_index`);--> statement-breakpoint
CREATE INDEX `tab_active_index` ON `tab` (`active`);--> statement-breakpoint
CREATE INDEX `tab_audible_index` ON `tab` (`audible`);--> statement-breakpoint
CREATE INDEX `tab_frozen_index` ON `tab` (`frozen`);--> statement-breakpoint
CREATE TABLE `window` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`deletedAt` integer,
	`browser_window_id` integer NOT NULL,
	`focused` integer DEFAULT false NOT NULL,
	`state` text,
	`incognito` integer DEFAULT false NOT NULL,
	`type` text
);
--> statement-breakpoint
CREATE INDEX `window_browser_id_index` ON `window` (`browser_window_id`);--> statement-breakpoint
CREATE INDEX `window_focused_index` ON `window` (`focused`);