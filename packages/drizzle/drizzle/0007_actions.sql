CREATE TABLE `actions` (
	`id` text(255) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`name` text(255) NOT NULL,
	`code` text NOT NULL,
	`runtime` text(50),
	`status` text(16),
	`secrets` text,
	`dependencies` text,
	`supported_triggers` text,
	`deployed_at_ts` integer,
	`is_system` integer,
	`inherit` integer,
	`created_at_ts` integer NOT NULL,
	`updated_at_ts` integer NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_actions_tenant_id` ON `actions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_actions_name` ON `actions` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `action_versions` (
	`id` text(255) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`action_id` text(255) NOT NULL,
	`number` integer NOT NULL,
	`code` text NOT NULL,
	`runtime` text(50),
	`secrets` text,
	`dependencies` text,
	`supported_triggers` text,
	`deployed` integer NOT NULL,
	`created_at_ts` integer NOT NULL,
	`updated_at_ts` integer NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_action_versions_number` ON `action_versions` (`tenant_id`,`action_id`,`number`);--> statement-breakpoint
CREATE INDEX `idx_action_versions_action_id` ON `action_versions` (`tenant_id`,`action_id`);--> statement-breakpoint
CREATE TABLE `action_executions` (
	`id` text(255) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`trigger_id` text(255) NOT NULL,
	`status` text(32) NOT NULL,
	`results` text NOT NULL,
	`logs` text,
	`created_at_ts` integer NOT NULL,
	`updated_at_ts` integer NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
