ALTER TABLE `tenants` ADD `deployment_type` text(16) DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `provisioning_state` text(16) DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `provisioning_error` text;--> statement-breakpoint
ALTER TABLE `tenants` ADD `provisioning_state_changed_at` text(35);--> statement-breakpoint
ALTER TABLE `tenants` ADD `bundle_configuration` text(64);--> statement-breakpoint
ALTER TABLE `tenants` ADD `worker_version` text(64);--> statement-breakpoint
ALTER TABLE `tenants` ADD `worker_script_name` text(255);--> statement-breakpoint
ALTER TABLE `tenants` ADD `storage_kind` text(32);--> statement-breakpoint
ALTER TABLE `tenants` ADD `d1_database_id` text(64);
