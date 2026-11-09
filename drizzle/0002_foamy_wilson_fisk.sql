CREATE TABLE `cloud_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version` integer NOT NULL,
	`target` text NOT NULL,
	`state` text NOT NULL,
	`before_hash` text NOT NULL,
	`after_hash` text NOT NULL,
	`backup_key` text NOT NULL,
	`result_key` text NOT NULL,
	`plan` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
