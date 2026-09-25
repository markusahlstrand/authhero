CREATE TABLE `token_exchange_profiles` (
	`id` text(64) PRIMARY KEY NOT NULL,
	`tenant_id` text(255) NOT NULL,
	`name` text(255) NOT NULL,
	`subject_token_type` text(255) NOT NULL,
	`action_id` text(255),
	`type` text(64) NOT NULL,
	`jwt_verification` text,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_exchange_profiles_tenant_subject_token_type_idx` ON `token_exchange_profiles` (`tenant_id`,`subject_token_type`);--> statement-breakpoint
ALTER TABLE `clients` ADD `token_exchange` text;