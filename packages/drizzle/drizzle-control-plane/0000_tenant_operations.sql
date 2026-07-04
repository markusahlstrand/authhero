CREATE TABLE `tenant_operation_events` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`operation_id` text(255) NOT NULL,
	`step` text(255) NOT NULL,
	`outcome` text(32) NOT NULL,
	`detail` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`created_at` text(35) NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `tenant_operations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenant_operation_events_operation_id_created_at_idx` ON `tenant_operation_events` (`operation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tenant_operations` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`tenant_id` text(255),
	`rollout_id` text(255),
	`kind` text(32) NOT NULL,
	`status` text(32) NOT NULL,
	`current_step` text(255),
	`engine` text(64) NOT NULL,
	`engine_instance_id` text(100),
	`target_worker_version` text(255),
	`target_database_version` text(255),
	`error` text,
	`initiated_by` text(255),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`finished_at` text(35)
);
--> statement-breakpoint
CREATE INDEX `tenant_operations_tenant_id_created_at_idx` ON `tenant_operations` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tenant_operations_rollout_id_idx` ON `tenant_operations` (`rollout_id`);--> statement-breakpoint
CREATE INDEX `tenant_operations_status_idx` ON `tenant_operations` (`status`);--> statement-breakpoint
CREATE TABLE `rollouts` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`kind` text(32) NOT NULL,
	`status` text(32) NOT NULL,
	`target_worker_version` text(255),
	`target_database_version` text(255),
	`wave_size` integer DEFAULT 10 NOT NULL,
	`canary_tenant_ids` text,
	`filter` text,
	`initiated_by` text(255),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`finished_at` text(35)
);
