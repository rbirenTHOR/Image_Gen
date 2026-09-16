ALTER TABLE `batches` ADD `workflow_json` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `batches` ADD `workflow_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `workflow_json` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `workflow_revision` integer DEFAULT 0 NOT NULL;