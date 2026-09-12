CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`project_id` text NOT NULL,
	`checks_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `approvals_owner` ON `approvals` (`owner_id`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`angle` text DEFAULT '' NOT NULL,
	`environment` text DEFAULT '' NOT NULL,
	`lighting` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`r2_key` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer DEFAULT 0 NOT NULL,
	`height` integer DEFAULT 0 NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`endpoint` text DEFAULT '' NOT NULL,
	`quality` text DEFAULT '' NOT NULL,
	`parent_id` text,
	`project_id` text,
	`batch_id` text,
	`in_library` integer DEFAULT 0 NOT NULL,
	`accepted` integer DEFAULT 0 NOT NULL,
	`approved` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_owner_library` ON `assets` (`owner_id`,`in_library`);--> statement-breakpoint
CREATE INDEX `assets_project` ON `assets` (`project_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`stage` text NOT NULL,
	`prompt` text NOT NULL,
	`endpoint` text NOT NULL,
	`quality` text NOT NULL,
	`aspect` text NOT NULL,
	`inputs_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `batches_owner_project` ON `batches` (`owner_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`slot` integer NOT NULL,
	`request_id` text,
	`status_url` text,
	`response_url` text,
	`status` text NOT NULL,
	`result_asset_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`poll_after` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`elapsed_ms` integer,
	`attempts` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_batch` ON `jobs` (`batch_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`step` text DEFAULT 'rv' NOT NULL,
	`rv_id` text,
	`landscape_id` text,
	`composition_id` text,
	`current_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner_updated` ON `projects` (`owner_id`,`updated_at`);