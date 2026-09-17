CREATE TABLE `model_pack_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`role` text DEFAULT 'identity' NOT NULL,
	`view` text DEFAULT '' NOT NULL,
	`room` text DEFAULT '' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`approved_for_generation` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pack_id`) REFERENCES `model_packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `model_pack_assets_pack_priority` ON `model_pack_assets` (`pack_id`,`priority`);--> statement-breakpoint
CREATE UNIQUE INDEX `model_pack_assets_pack_asset` ON `model_pack_assets` (`pack_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `model_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`model_year` text DEFAULT '' NOT NULL,
	`product_class` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_packs_owner_updated` ON `model_packs` (`owner_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `model_pack_id` text;--> statement-breakpoint
CREATE INDEX `projects_model_pack` ON `projects` (`model_pack_id`);