ALTER TABLE `projects` ADD `preset_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `projects_preset` ON `projects` (`preset_id`);