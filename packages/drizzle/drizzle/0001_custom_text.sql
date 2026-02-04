CREATE TABLE `custom_text` (
	`tenant_id` text(191) NOT NULL,
	`prompt` text(64) NOT NULL,
	`language` text(16) NOT NULL,
	`custom_text` text NOT NULL,
	`created_at_ts` integer NOT NULL,
	`updated_at_ts` integer NOT NULL,
	PRIMARY KEY(`tenant_id`, `prompt`, `language`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
