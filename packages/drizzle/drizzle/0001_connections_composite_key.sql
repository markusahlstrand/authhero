PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_connections` (
	`id` text(255) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`name` text(255) NOT NULL,
	`response_type` text(255),
	`response_mode` text(255),
	`strategy` text(64),
	`options` text(8192) DEFAULT '{}' NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`display_name` text(255),
	`is_domain_connection` integer,
	`show_as_button` integer,
	`is_system` integer DEFAULT 0 NOT NULL,
	`metadata` text(4096),
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_connections`("id", "tenant_id", "name", "response_type", "response_mode", "strategy", "options", "created_at", "updated_at", "display_name", "is_domain_connection", "show_as_button", "is_system", "metadata") SELECT "id", "tenant_id", "name", "response_type", "response_mode", "strategy", "options", "created_at", "updated_at", "display_name", "is_domain_connection", "show_as_button", "is_system", "metadata" FROM `connections`;--> statement-breakpoint
DROP TABLE `connections`;--> statement-breakpoint
ALTER TABLE `__new_connections` RENAME TO `connections`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `connections_tenant_id_index` ON `connections` (`tenant_id`);