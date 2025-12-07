ALTER TABLE `tab` ADD `parent_tab_id` integer;--> statement-breakpoint
ALTER TABLE `tab` ADD `tree_order` text DEFAULT 'a0' NOT NULL;--> statement-breakpoint
ALTER TABLE `tab` ADD `is_collapsed` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `tab_parent_id_index` ON `tab` (`parent_tab_id`);--> statement-breakpoint
CREATE INDEX `tab_tree_order_index` ON `tab` (`tree_order`);