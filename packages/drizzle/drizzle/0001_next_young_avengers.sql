CREATE TABLE `grants` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`tenant_id` text(255) NOT NULL,
	`user_id` text(255) NOT NULL,
	`client_id` text(100) NOT NULL,
	`audience` text(100) DEFAULT '' NOT NULL,
	`scope` text DEFAULT '[]' NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`tenant_id`) REFERENCES `users`(`user_id`,`tenant_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grants_natural_key_idx` ON `grants` (`tenant_id`,`user_id`,`client_id`,`audience`);--> statement-breakpoint
CREATE INDEX `grants_tenant_user_idx` ON `grants` (`tenant_id`,`user_id`);