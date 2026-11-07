CREATE TABLE `auth_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
