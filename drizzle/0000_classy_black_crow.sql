CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`image_key` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`draft` text,
	`evidence` text,
	`error` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_owner_updated` ON `documents` (`owner`,`updated_at`);