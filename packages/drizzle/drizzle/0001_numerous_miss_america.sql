PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hooks` (
	`hook_id` text(255) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`url` text(512),
	`trigger_id` text(255) NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`synchronous` integer DEFAULT false NOT NULL,
	`priority` integer,
	`form_id` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_hooks`("hook_id", "tenant_id", "url", "trigger_id", "enabled", "created_at", "updated_at", "synchronous", "priority", "form_id") SELECT "hook_id", "tenant_id", "url", "trigger_id", "enabled", "created_at", "updated_at", "synchronous", "priority", "form_id" FROM `hooks`;--> statement-breakpoint
DROP TABLE `hooks`;--> statement-breakpoint
ALTER TABLE `__new_hooks` RENAME TO `hooks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;