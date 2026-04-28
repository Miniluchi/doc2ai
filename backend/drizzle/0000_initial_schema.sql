CREATE TABLE IF NOT EXISTS `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`config` text NOT NULL,
	`status` text DEFAULT 'inactive' NOT NULL,
	`lastSync` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceId` text NOT NULL,
	`fileName` text NOT NULL,
	`filePath` text NOT NULL,
	`outputPath` text,
	`fileSize` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`error` text,
	`startedAt` integer,
	`completedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceId` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `converted_files` (
	`id` text PRIMARY KEY NOT NULL,
	`originalPath` text NOT NULL,
	`convertedPath` text NOT NULL,
	`fileName` text NOT NULL,
	`fileType` text NOT NULL,
	`platform` text NOT NULL,
	`checksum` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `converted_files_originalPath_platform_unique` ON `converted_files` (`originalPath`,`platform`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversion_jobs_status_createdAt_idx` ON `conversion_jobs` (`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversion_jobs_sourceId_status_idx` ON `conversion_jobs` (`sourceId`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversion_jobs_createdAt_idx` ON `conversion_jobs` (`createdAt`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sync_logs_sourceId_createdAt_idx` ON `sync_logs` (`sourceId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sync_logs_status_createdAt_idx` ON `sync_logs` (`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `converted_files_platform_createdAt_idx` ON `converted_files` (`platform`,`createdAt`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `converted_files_checksum_idx` ON `converted_files` (`checksum`);
