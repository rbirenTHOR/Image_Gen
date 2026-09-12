CREATE TABLE `campaign_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`removed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `campaign_assets_project` ON `campaign_assets` (`project_id`,`removed_at`);--> statement-breakpoint
CREATE TABLE `campaign_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`user_text` text NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`suggestions_json` text DEFAULT '[]' NOT NULL,
	`references_json` text NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`error` text,
	`batch_id` text,
	`aspect` text DEFAULT 'landscape_4_3' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `campaign_turns_project_created` ON `campaign_turns` (`project_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `gallery_migrated` integer DEFAULT 0 NOT NULL;