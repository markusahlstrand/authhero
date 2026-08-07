CREATE TABLE `scim_configurations` (
	`connection_id` text(255) PRIMARY KEY NOT NULL,
	`tenant_id` text(255) NOT NULL,
	`user_id_attribute` text(255) DEFAULT 'externalId' NOT NULL,
	`mapping` text(16384) DEFAULT '[]' NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scim_configurations_tenant_id_idx` ON `scim_configurations` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `scim_external_ids` (
	`tenant_id` text(255) NOT NULL,
	`connection_id` text(255) NOT NULL,
	`external_id` text(255) NOT NULL,
	`user_id` text(255) NOT NULL,
	`created_at` text(35) NOT NULL,
	PRIMARY KEY(`connection_id`, `user_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scim_external_ids_connection_external_idx` ON `scim_external_ids` (`connection_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `scim_external_ids_tenant_id_idx` ON `scim_external_ids` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `scim_tokens` (
	`token_id` text(64) PRIMARY KEY NOT NULL,
	`tenant_id` text(255) NOT NULL,
	`connection_id` text(255) NOT NULL,
	`token_hash` text(128) NOT NULL,
	`scopes` text(4096) DEFAULT '[]' NOT NULL,
	`valid_until` text(35),
	`created_at` text(35) NOT NULL,
	`last_used_at` text(35)
);
--> statement-breakpoint
CREATE INDEX `scim_tokens_tenant_connection_idx` ON `scim_tokens` (`tenant_id`,`connection_id`);--> statement-breakpoint
CREATE INDEX `scim_tokens_tenant_hash_idx` ON `scim_tokens` (`tenant_id`,`token_hash`);