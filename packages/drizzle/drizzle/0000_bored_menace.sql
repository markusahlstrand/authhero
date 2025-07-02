-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `applications` (
	`id` varchar(255) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`client_secret` varchar(255),
	`allowed_logout_urls` varchar(255),
	`authentication_settings` varchar(255),
	`email_validation` varchar(255),
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	`disable_sign_ups` tinyint(1) NOT NULL,
	`addons` varchar(4096) NOT NULL DEFAULT '{}',
	`callbacks` varchar(1024) NOT NULL DEFAULT '[]',
	`allowed_origins` varchar(1024) NOT NULL DEFAULT '[]',
	`web_origins` varchar(1024) NOT NULL DEFAULT '[]',
	`allowed_clients` varchar(1024) NOT NULL DEFAULT '[]',
	CONSTRAINT `applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branding` (
	`tenant_id` varchar(255) NOT NULL,
	`logo_url` varchar(512),
	`favicon_url` varchar(512),
	`font_url` varchar(512),
	`colors_primary` varchar(8),
	`colors_page_background_type` varchar(32),
	`colors_page_background_start` varchar(8),
	`colors_page_background_end` varchar(8),
	`colors_page_background_angle_dev` int,
	CONSTRAINT `branding_tenant_id` PRIMARY KEY(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `codes` (
	`code_id` varchar(255) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`user_id` varchar(255),
	`login_id` varchar(255),
	`connection_id` varchar(255),
	`code_type` varchar(255) NOT NULL,
	`created_at` varchar(255) NOT NULL,
	`expires_at` varchar(255) NOT NULL,
	`used_at` varchar(255),
	`code_verifier` varchar(128),
	`code_challenge` varchar(128),
	`code_challenge_method` varchar(5),
	`redirect_uri` varchar(1024),
	`nonce` varchar(1024),
	`state` varchar(2048),
	CONSTRAINT `codes_code_id_code_type_tenant_id` PRIMARY KEY(`code_id`,`code_type`,`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`id` varchar(255) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`response_type` varchar(255),
	`response_mode` varchar(255),
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	`options` varchar(2048) NOT NULL DEFAULT '{}',
	`strategy` varchar(64) NOT NULL,
	CONSTRAINT `connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custom_domains` (
	`custom_domain_id` varchar(256) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`domain` varchar(255) NOT NULL,
	`primary` tinyint(1) NOT NULL,
	`status` varchar(50) NOT NULL,
	`type` varchar(50) NOT NULL,
	`origin_domain_name` varchar(255),
	`verification` varchar(2048),
	`custom_client_ip_header` varchar(50),
	`tls_policy` varchar(50),
	`domain_metadata` varchar(2048),
	`created_at` varchar(35) NOT NULL,
	`updated_at` varchar(35) NOT NULL,
	CONSTRAINT `custom_domains_custom_domain_id` PRIMARY KEY(`custom_domain_id`)
);
--> statement-breakpoint
CREATE TABLE `email_providers` (
	`tenant_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`enabled` tinyint(1) NOT NULL,
	`default_from_address` varchar(255),
	`credentials` varchar(2048) NOT NULL DEFAULT '{}',
	`settings` varchar(2048) NOT NULL DEFAULT '{}',
	`created_at` varchar(29) NOT NULL,
	`updated_at` varchar(29) NOT NULL,
	CONSTRAINT `email_providers_tenant_id` PRIMARY KEY(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `forms` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`messages` varchar(255),
	`languages` varchar(255),
	`translations` varchar(4096),
	`nodes` varchar(4096),
	`start` varchar(255),
	`ending` varchar(255),
	`style` varchar(1042),
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	CONSTRAINT `forms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hooks` (
	`hook_id` varchar(255) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`trigger_id` varchar(255) NOT NULL,
	`enabled` tinyint(1) NOT NULL,
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	`synchronous` tinyint(1) NOT NULL DEFAULT 0,
	`priority` int,
	`form_id` text,
	`url` varchar(512),
	CONSTRAINT `hooks_hook_id` PRIMARY KEY(`hook_id`)
);
--> statement-breakpoint
CREATE TABLE `keys` (
	`kid` varchar(255) NOT NULL,
	`tenant_id` varchar(255),
	`created_at` varchar(255) NOT NULL,
	`revoked_at` varchar(255),
	`cert` varchar(2048),
	`pkcs7` varchar(2048),
	`fingerprint` varchar(256),
	`thumbprint` varchar(256),
	`current_since` varchar(256),
	`current_until` varchar(256),
	CONSTRAINT `keys_kid` PRIMARY KEY(`kid`)
);
--> statement-breakpoint
CREATE TABLE `kysely_migration` (
	`name` varchar(255) NOT NULL,
	`timestamp` varchar(255) NOT NULL,
	CONSTRAINT `kysely_migration_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
CREATE TABLE `kysely_migration_lock` (
	`id` varchar(255) NOT NULL,
	`is_locked` int NOT NULL DEFAULT 0,
	CONSTRAINT `kysely_migration_lock_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_sessions` (
	`id` varchar(21) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`session_id` varchar(21),
	`csrf_token` varchar(21) NOT NULL,
	`authParams_client_id` varchar(255) NOT NULL,
	`authParams_vendor_id` varchar(255),
	`authParams_username` varchar(255),
	`authParams_response_type` varchar(255),
	`authParams_response_mode` varchar(255),
	`authParams_audience` varchar(255),
	`authParams_scope` varchar(511),
	`authParams_state` varchar(2048),
	`authParams_nonce` varchar(255),
	`authParams_code_challenge_method` varchar(255),
	`authParams_code_challenge` varchar(255),
	`authParams_redirect_uri` varchar(255),
	`authParams_organization` varchar(255),
	`authParams_prompt` varchar(32),
	`authParams_act_as` varchar(256),
	`authParams_ui_locales` varchar(32),
	`authorization_url` varchar(1024),
	`created_at` varchar(35) NOT NULL,
	`updated_at` varchar(35) NOT NULL,
	`expires_at` varchar(35) NOT NULL,
	`ip` varchar(39),
	`useragent` varchar(1024),
	`auth0Client` varchar(255),
	`login_completed` tinyint(1) NOT NULL DEFAULT 0,
	CONSTRAINT `login_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` varchar(255) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`ip` varchar(255),
	`type` varchar(8) NOT NULL,
	`date` varchar(25) NOT NULL,
	`description` varchar(255),
	`client_id` varchar(255),
	`client_name` varchar(255),
	`user_agent` varchar(1024),
	`details` varchar(8192),
	`user_name` varchar(255),
	`auth0_client` varchar(255),
	`isMobile` tinyint(1),
	`connection` varchar(255),
	`connection_id` varchar(255),
	`audience` varchar(255),
	`scope` varchar(255),
	`strategy` varchar(255),
	`strategy_type` varchar(255),
	`hostname` varchar(255),
	`session_connection` varchar(255),
	CONSTRAINT `logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` varchar(255) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`sub` varchar(255),
	`email` varchar(255),
	`name` varchar(255),
	`status` varchar(255),
	`role` varchar(255),
	`picture` varchar(255),
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	CONSTRAINT `members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `migrations` (
	`id` varchar(255) NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`provider` varchar(255),
	`client_id` varchar(255),
	`origin` varchar(255),
	`domain` varchar(255),
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	CONSTRAINT `migrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `passwords` (
	`tenant_id` varchar(255) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	`password` varchar(255) NOT NULL,
	`algorithm` varchar(16),
	CONSTRAINT `passwords_user_id_tenant_id` PRIMARY KEY(`user_id`,`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `prompt_settings` (
	`tenant_id` varchar(64) NOT NULL,
	`universal_login_experience` varchar(16) NOT NULL DEFAULT 'new',
	`identifier_first` tinyint(1) NOT NULL DEFAULT 1,
	`password_first` tinyint(1) NOT NULL DEFAULT 0,
	`webauthn_platform_first_factor` tinyint(1) NOT NULL DEFAULT 0,
	CONSTRAINT `prompt_settings_tenant_id` PRIMARY KEY(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` varchar(21) NOT NULL,
	`client_id` varchar(21) NOT NULL,
	`tenant_id` varchar(255),
	`session_id` varchar(21) NOT NULL,
	`user_id` varchar(255),
	`created_at` varchar(35) NOT NULL,
	`expires_at` varchar(35),
	`idle_expires_at` varchar(35),
	`last_exchanged_at` varchar(35),
	`device` varchar(2048) NOT NULL,
	`resource_servers` varchar(2048) NOT NULL,
	`rotating` tinyint(1) NOT NULL,
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(21) NOT NULL,
	`tenant_id` varchar(255),
	`user_id` varchar(255),
	`created_at` varchar(35) NOT NULL,
	`updated_at` varchar(35) NOT NULL,
	`expires_at` varchar(35),
	`idle_expires_at` varchar(35),
	`authenticated_at` varchar(35),
	`last_interaction_at` varchar(35),
	`used_at` varchar(35),
	`revoked_at` varchar(35),
	`device` varchar(2048) NOT NULL,
	`clients` varchar(1024) NOT NULL,
	`login_session_id` varchar(21),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255),
	`audience` varchar(255),
	`sender_email` varchar(255),
	`sender_name` varchar(255),
	`language` varchar(255),
	`logo` varchar(255),
	`primary_color` varchar(255),
	`secondary_color` varchar(255),
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	`support_url` varchar(255),
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`tenant_id` varchar(255) NOT NULL,
	`email` varchar(255),
	`given_name` varchar(255),
	`family_name` varchar(255),
	`nickname` varchar(255),
	`name` varchar(255),
	`picture` varchar(2083),
	`created_at` varchar(255) NOT NULL,
	`updated_at` varchar(255) NOT NULL,
	`linked_to` varchar(255),
	`last_ip` varchar(255),
	`login_count` int NOT NULL,
	`last_login` varchar(255),
	`provider` varchar(255) NOT NULL,
	`connection` varchar(255) NOT NULL,
	`email_verified` tinyint(1) NOT NULL,
	`is_social` tinyint(1) NOT NULL,
	`app_metadata` varchar(4096) NOT NULL DEFAULT '{}',
	`profileData` varchar(2048),
	`locale` varchar(255),
	`user_id` varchar(255) NOT NULL,
	`user_metadata` varchar(4096) NOT NULL DEFAULT '{}',
	`phone_number` varchar(17),
	`phone_verified` tinyint(1),
	`username` varchar(128),
	CONSTRAINT `users_tenant_id_user_id` PRIMARY KEY(`tenant_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `codes` ADD CONSTRAINT `FK_codes_user_id_tenant_id_constraint` FOREIGN KEY (`user_id`,`tenant_id`) REFERENCES `users`(`user_id`,`tenant_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `login_sessions` ADD CONSTRAINT `fk_login_sessions_session` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_constraint` FOREIGN KEY (`user_id`,`tenant_id`) REFERENCES `users`(`user_id`,`tenant_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_constraint` FOREIGN KEY (`user_id`,`tenant_id`) REFERENCES `users`(`user_id`,`tenant_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `forms_tenant_id_idx` ON `forms` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_login_sessions_session_id` ON `login_sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `IDX_logs_tenant_date_type_user` ON `logs` (`tenant_id`,`date`,`type`,`user_id`);--> statement-breakpoint
CREATE INDEX `logs_date` ON `logs` (`date`);--> statement-breakpoint
CREATE INDEX `logs_tenant_id` ON `logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `logs_user_id` ON `logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `IDX_sessions_login_session_id` ON `sessions` (`login_session_id`);--> statement-breakpoint
CREATE INDEX `unique_email_provider` ON `users` (`email`,`provider`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `users_linked_to_index` ON `users` (`linked_to`);--> statement-breakpoint
CREATE INDEX `users_name_index` ON `users` (`name`);--> statement-breakpoint
CREATE INDEX `users_tenant_index` ON `users` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `users_user_id_tenant_id` ON `users` (`user_id`,`tenant_id`);
*/