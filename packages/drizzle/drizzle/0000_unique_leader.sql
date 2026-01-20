CREATE TABLE `tenants` (
	`id` text(191) PRIMARY KEY NOT NULL,
	`name` text(255),
	`audience` text(255),
	`sender_email` text(255),
	`sender_name` text(255),
	`language` text(255),
	`logo` text(255),
	`primary_color` text(255),
	`secondary_color` text(255),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`support_url` text(255),
	`idle_session_lifetime` integer,
	`session_lifetime` integer,
	`session_cookie` text,
	`allowed_logout_urls` text,
	`ephemeral_session_lifetime` integer,
	`idle_ephemeral_session_lifetime` integer,
	`default_redirection_uri` text,
	`enabled_locales` text,
	`default_directory` text(255),
	`error_page` text,
	`flags` text,
	`friendly_name` text(255),
	`picture_url` text,
	`support_email` text(255),
	`sandbox_version` text(50),
	`sandbox_versions_available` text,
	`legacy_sandbox_version` text(50),
	`change_password` text,
	`guardian_mfa_page` text,
	`device_flow` text,
	`default_token_quota` text,
	`default_audience` text(255),
	`default_organization` text(255),
	`sessions` text,
	`oidc_logout` text,
	`allow_organization_name_in_authentication_api` integer,
	`customize_mfa_in_postlogin_action` integer,
	`acr_values_supported` text,
	`mtls` text,
	`pushed_authorization_requests_supported` integer,
	`authorization_response_iss_parameter_supported` integer
);
--> statement-breakpoint
CREATE TABLE `passwords` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`user_id` text(255) NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`password` text(255) NOT NULL,
	`algorithm` text(16) DEFAULT 'bcrypt' NOT NULL,
	`is_current` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` text(255) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`email` text(255),
	`given_name` text(255),
	`family_name` text(255),
	`nickname` text(255),
	`name` text(255),
	`picture` text(2083),
	`tags` text(255),
	`phone_number` text(17),
	`phone_verified` integer,
	`username` text(128),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`linked_to` text(255),
	`last_ip` text(255),
	`login_count` integer NOT NULL,
	`last_login` text(255),
	`provider` text(255) NOT NULL,
	`connection` text(255),
	`email_verified` integer NOT NULL,
	`is_social` integer NOT NULL,
	`app_metadata` text(4096) DEFAULT '{}' NOT NULL,
	`user_metadata` text(4096) DEFAULT '{}' NOT NULL,
	`profileData` text(2048),
	`locale` text(255),
	PRIMARY KEY(`user_id`, `tenant_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_email_provider` ON `users` (`email`,`provider`,`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_phone_provider` ON `users` (`phone_number`,`provider`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `users_email_index` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_linked_to_index` ON `users` (`linked_to`);--> statement-breakpoint
CREATE INDEX `users_name_index` ON `users` (`name`);--> statement-breakpoint
CREATE INDEX `users_phone_tenant_provider_index` ON `users` (`tenant_id`,`phone_number`,`provider`);--> statement-breakpoint
CREATE TABLE `authentication_codes` (
	`tenant_id` text(191) NOT NULL,
	`code` text(255) PRIMARY KEY NOT NULL,
	`client_id` text(255) NOT NULL,
	`user_id` text(255) NOT NULL,
	`nonce` text(255),
	`state` text(8192),
	`scope` text(1024),
	`response_type` text(256),
	`response_mode` text(256),
	`redirect_uri` text(1024),
	`created_at` text(35) NOT NULL,
	`expires_at` text(35) NOT NULL,
	`used_at` text(35),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `codes` (
	`code_id` text(191) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`user_id` text(255),
	`login_id` text(255),
	`connection_id` text(255),
	`code_type` text(255) NOT NULL,
	`created_at` text(35) NOT NULL,
	`expires_at` text(35) NOT NULL,
	`used_at` text(35),
	`code_verifier` text(128),
	`code_challenge` text(128),
	`code_challenge_method` text(5),
	`redirect_uri` text(1024),
	`nonce` text(1024),
	`state` text(2048),
	PRIMARY KEY(`code_id`, `code_type`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `codes_expires_at_index` ON `codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `login_sessions` (
	`id` text(21) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`session_id` text(21),
	`csrf_token` text(21) NOT NULL,
	`authParams_client_id` text(191) NOT NULL,
	`authParams_vendor_id` text(255),
	`authParams_username` text(255),
	`authParams_response_type` text(255),
	`authParams_response_mode` text(255),
	`authParams_audience` text(255),
	`authParams_scope` text,
	`authParams_state` text,
	`authParams_nonce` text(255),
	`authParams_code_challenge_method` text(255),
	`authParams_code_challenge` text(255),
	`authParams_redirect_uri` text,
	`authParams_organization` text(255),
	`authParams_prompt` text(32),
	`authParams_act_as` text(256),
	`authParams_ui_locales` text(32),
	`authorization_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip` text(39),
	`useragent` text,
	`auth0Client` text(255),
	`state` text(50) DEFAULT 'pending' NOT NULL,
	`state_data` text,
	`failure_reason` text,
	`user_id` text(255),
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `login_sessions_id_index` ON `login_sessions` (`id`);--> statement-breakpoint
CREATE INDEX `login_sessions_state_idx` ON `login_sessions` (`state`);--> statement-breakpoint
CREATE INDEX `login_sessions_state_updated_idx` ON `login_sessions` (`state`,`updated_at`);--> statement-breakpoint
CREATE INDEX `login_sessions_tenant_user_idx` ON `login_sessions` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_login_sessions_expires_at` ON `login_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `otps` (
	`tenant_id` text(191) NOT NULL,
	`id` text(255) PRIMARY KEY NOT NULL,
	`client_id` text(255) NOT NULL,
	`code` text(255) NOT NULL,
	`email` text(255) NOT NULL,
	`user_id` text(255),
	`send` text(255),
	`nonce` text(255),
	`state` text(1024),
	`scope` text(1024),
	`response_type` text(256),
	`response_mode` text(256),
	`redirect_uri` text(1024),
	`created_at` text(35) NOT NULL,
	`expires_at` text(35) NOT NULL,
	`used_at` text(35),
	`audience` text(255),
	`ip` text(64),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `otps_email_index` ON `otps` (`email`);--> statement-breakpoint
CREATE INDEX `otps_expires_at_index` ON `otps` (`expires_at`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text(21) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`client_id` text(191) NOT NULL,
	`session_id` text(21) NOT NULL,
	`user_id` text(255),
	`resource_servers` text NOT NULL,
	`device` text NOT NULL,
	`rotating` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`idle_expires_at` integer,
	`last_exchanged_at` integer,
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_user_id` ON `refresh_tokens` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_session_id` ON `refresh_tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_expires_at` ON `refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text(21) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`user_id` text(255),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer,
	`idle_expires_at` integer,
	`authenticated_at` integer,
	`last_interaction_at` integer,
	`used_at` integer,
	`revoked_at` integer,
	`device` text NOT NULL,
	`clients` text NOT NULL,
	`login_session_id` text(21),
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `IDX_sessions_login_session_id` ON `sessions` (`login_session_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`tenant_id` text(191) NOT NULL,
	`id` text(255) PRIMARY KEY NOT NULL,
	`client_id` text(255) NOT NULL,
	`email` text(255) NOT NULL,
	`nonce` text(255),
	`state` text(1024),
	`scope` text(1024),
	`response_type` text(256),
	`response_mode` text(256),
	`redirect_uri` text(1024),
	`created_at` text(35) NOT NULL,
	`expires_at` text(35) NOT NULL,
	`used_at` text(35),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_grants` (
	`id` text(21) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`client_id` text(191) NOT NULL,
	`audience` text(191) NOT NULL,
	`scope` text DEFAULT '[]',
	`organization_usage` text(32),
	`allow_any_organization` integer DEFAULT 0,
	`is_system` integer DEFAULT 0,
	`subject_type` text(32),
	`authorization_details_types` text DEFAULT '[]',
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_client_grants_audience` ON `client_grants` (`audience`);--> statement-breakpoint
CREATE TABLE `clients` (
	`client_id` text(191) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`name` text(255) NOT NULL,
	`description` text(140),
	`global` integer DEFAULT 0 NOT NULL,
	`client_secret` text(255),
	`app_type` text(64) DEFAULT 'regular_web',
	`logo_uri` text(2083),
	`is_first_party` integer DEFAULT 0 NOT NULL,
	`oidc_conformant` integer DEFAULT 1 NOT NULL,
	`callbacks` text NOT NULL,
	`allowed_origins` text NOT NULL,
	`web_origins` text NOT NULL,
	`client_aliases` text NOT NULL,
	`allowed_clients` text NOT NULL,
	`allowed_logout_urls` text NOT NULL,
	`session_transfer` text NOT NULL,
	`oidc_logout` text NOT NULL,
	`grant_types` text NOT NULL,
	`jwt_configuration` text NOT NULL,
	`signing_keys` text NOT NULL,
	`encryption_key` text NOT NULL,
	`sso` integer DEFAULT 0 NOT NULL,
	`sso_disabled` integer DEFAULT 1 NOT NULL,
	`cross_origin_authentication` integer DEFAULT 0 NOT NULL,
	`cross_origin_loc` text(2083),
	`custom_login_page_on` integer DEFAULT 0 NOT NULL,
	`custom_login_page` text,
	`custom_login_page_preview` text,
	`form_template` text,
	`addons` text NOT NULL,
	`token_endpoint_auth_method` text(64) DEFAULT 'client_secret_basic',
	`client_metadata` text NOT NULL,
	`mobile` text NOT NULL,
	`initiate_login_uri` text(2083),
	`native_social_login` text NOT NULL,
	`refresh_token` text NOT NULL,
	`default_organization` text NOT NULL,
	`organization_usage` text(32) DEFAULT 'deny',
	`organization_require_behavior` text(32) DEFAULT 'no_prompt',
	`client_authentication_methods` text NOT NULL,
	`require_pushed_authorization_requests` integer DEFAULT 0 NOT NULL,
	`require_proof_of_possession` integer DEFAULT 0 NOT NULL,
	`signed_request_object` text NOT NULL,
	`compliance_level` text(64),
	`par_request_expiry` integer,
	`token_quota` text NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`connections` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`tenant_id`, `client_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `connections` (
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
CREATE INDEX `connections_tenant_id_index` ON `connections` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_id_unique` ON `connections` (`id`);--> statement-breakpoint
CREATE TABLE `custom_domains` (
	`custom_domain_id` text(256) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`domain` text(255) NOT NULL,
	`primary` integer NOT NULL,
	`status` text(50) NOT NULL,
	`type` text(50) NOT NULL,
	`origin_domain_name` text(255),
	`verification` text(2048),
	`custom_client_ip_header` text(50),
	`tls_policy` text(50),
	`domain_metadata` text(2048),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`domain` text(255) NOT NULL,
	`email_service` text(255),
	`email_api_key` text(255),
	`dkim_private_key` text(2048),
	`dkim_public_key` text(2048),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`organization_id` text(21) NOT NULL,
	`inviter` text NOT NULL,
	`invitee` text NOT NULL,
	`client_id` text(191) NOT NULL,
	`connection_id` text(21),
	`invitation_url` text NOT NULL,
	`created_at` text(35) NOT NULL,
	`expires_at` text(35) NOT NULL,
	`app_metadata` text,
	`user_metadata` text,
	`roles` text,
	`ticket_id` text(191),
	`ttl_sec` integer,
	`send_invitation_email` integer
);
--> statement-breakpoint
CREATE INDEX `idx_invites_tenant_id` ON `invites` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_invites_organization_id` ON `invites` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_invites_expires_at` ON `invites` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_invites_tenant_created` ON `invites` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`name` text(256) NOT NULL,
	`display_name` text(256),
	`branding` text,
	`metadata` text,
	`enabled_connections` text,
	`token_quota` text,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_organizations_tenant_id` ON `organizations` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `user_organizations` (
	`id` text(21) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`user_id` text(191) NOT NULL,
	`organization_id` text(21) NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_organizations_unique` ON `user_organizations` (`tenant_id`,`user_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_user_organizations_tenant_id` ON `user_organizations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_user_organizations_user_id` ON `user_organizations` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_organizations_organization_id` ON `user_organizations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `resource_servers` (
	`id` text(21) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`identifier` text(191) NOT NULL,
	`name` text(255) NOT NULL,
	`scopes` text(4096),
	`signing_alg` text(64),
	`signing_secret` text(2048),
	`token_lifetime` integer,
	`token_lifetime_for_web` integer,
	`skip_consent_for_verifiable_first_party_clients` integer,
	`allow_offline_access` integer,
	`verification_key` text(4096),
	`options` text(4096),
	`is_system` integer DEFAULT 0 NOT NULL,
	`metadata` text(4096),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`tenant_id` text(191) NOT NULL,
	`role_id` text(21) NOT NULL,
	`resource_server_identifier` text(191) NOT NULL,
	`permission_name` text(191) NOT NULL,
	`created_at` text(35) NOT NULL,
	PRIMARY KEY(`tenant_id`, `role_id`, `resource_server_identifier`, `permission_name`)
);
--> statement-breakpoint
CREATE INDEX `role_permissions_role_fk` ON `role_permissions` (`tenant_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `role_permissions_permission_fk` ON `role_permissions` (`tenant_id`,`resource_server_identifier`,`permission_name`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text(21) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`name` text(50) NOT NULL,
	`description` text(255),
	`is_system` integer DEFAULT 0 NOT NULL,
	`metadata` text(4096),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`tenant_id` text(191) NOT NULL,
	`user_id` text(191) NOT NULL,
	`resource_server_identifier` text(191) NOT NULL,
	`permission_name` text(191) NOT NULL,
	`organization_id` text(21) DEFAULT '' NOT NULL,
	`created_at` text(35) NOT NULL,
	PRIMARY KEY(`tenant_id`, `user_id`, `resource_server_identifier`, `permission_name`, `organization_id`)
);
--> statement-breakpoint
CREATE INDEX `user_permissions_user_fk` ON `user_permissions` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `user_permissions_permission_fk` ON `user_permissions` (`tenant_id`,`resource_server_identifier`,`permission_name`);--> statement-breakpoint
CREATE INDEX `user_permissions_organization_fk` ON `user_permissions` (`organization_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`tenant_id` text(191) NOT NULL,
	`user_id` text(191) NOT NULL,
	`role_id` text(21) NOT NULL,
	`organization_id` text(191) DEFAULT '' NOT NULL,
	`created_at` text(35) NOT NULL,
	PRIMARY KEY(`tenant_id`, `user_id`, `role_id`, `organization_id`)
);
--> statement-breakpoint
CREATE INDEX `user_roles_user_fk` ON `user_roles` (`tenant_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `user_roles_role_fk` ON `user_roles` (`tenant_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `user_roles_organization_fk` ON `user_roles` (`organization_id`);--> statement-breakpoint
CREATE TABLE `branding` (
	`tenant_id` text(191) PRIMARY KEY NOT NULL,
	`logo_url` text(512),
	`favicon_url` text(512),
	`font_url` text(512),
	`colors_primary` text(8),
	`colors_page_background_type` text(32),
	`colors_page_background_start` text(8),
	`colors_page_background_end` text(8),
	`colors_page_background_angle_dev` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_providers` (
	`tenant_id` text(191) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`enabled` integer NOT NULL,
	`default_from_address` text(255),
	`credentials` text(2048) DEFAULT '{}' NOT NULL,
	`settings` text(2048) DEFAULT '{}' NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flows` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`name` text(150) NOT NULL,
	`actions` text,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flows_tenant_id_idx` ON `flows` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`messages` text(255),
	`languages` text(255),
	`translations` text(4096),
	`nodes` text(4096),
	`start` text(255),
	`ending` text(255),
	`style` text(1042),
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `forms_tenant_id_idx` ON `forms` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `hooks` (
	`hook_id` text(255) PRIMARY KEY NOT NULL,
	`tenant_id` text(191) NOT NULL,
	`url` text(512) NOT NULL,
	`trigger_id` text(255) NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	`synchronous` integer DEFAULT false NOT NULL,
	`priority` integer,
	`form_id` text,
	`url_tmp` text(512),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `keys` (
	`kid` text(255) PRIMARY KEY NOT NULL,
	`tenant_id` text(191),
	`created_at` text(35) NOT NULL,
	`revoked_at` text(35),
	`cert` text(4096),
	`pkcs7` text(4096),
	`fingerprint` text(256),
	`thumbprint` text(256),
	`current_since` text(35),
	`current_until` text(35),
	`type` text(50) DEFAULT 'jwt_signing' NOT NULL,
	`connection` text(255),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prompt_settings` (
	`tenant_id` text(191) PRIMARY KEY NOT NULL,
	`universal_login_experience` text(16) DEFAULT 'new' NOT NULL,
	`identifier_first` integer DEFAULT true NOT NULL,
	`password_first` integer DEFAULT false NOT NULL,
	`webauthn_platform_first_factor` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `themes` (
	`tenant_id` text(191) NOT NULL,
	`themeId` text(255) NOT NULL,
	`displayName` text(255) NOT NULL,
	`colors_primary_button_label` text(24) NOT NULL,
	`colors_primary_button` text(24) NOT NULL,
	`colors_secondary_button_border` text(24) NOT NULL,
	`colors_secondary_button_label` text(24) NOT NULL,
	`colors_base_focus_color` text(24) NOT NULL,
	`colors_base_hover_color` text(24) NOT NULL,
	`colors_body_text` text(24) NOT NULL,
	`colors_captcha_widget_theme` text(24) NOT NULL,
	`colors_error` text(24) NOT NULL,
	`colors_header` text(24) NOT NULL,
	`colors_icons` text(24) NOT NULL,
	`colors_input_background` text(24) NOT NULL,
	`colors_input_border` text(24) NOT NULL,
	`colors_input_filled_text` text(24) NOT NULL,
	`colors_input_labels_placeholders` text(24) NOT NULL,
	`colors_links_focused_components` text(24) NOT NULL,
	`colors_success` text(24) NOT NULL,
	`colors_widget_background` text(24) NOT NULL,
	`colors_widget_border` text(24) NOT NULL,
	`borders_button_border_radius` integer NOT NULL,
	`borders_button_border_weight` integer NOT NULL,
	`borders_buttons_style` text(24) NOT NULL,
	`borders_input_border_radius` integer NOT NULL,
	`borders_input_border_weight` integer NOT NULL,
	`borders_inputs_style` text(24) NOT NULL,
	`borders_show_widget_shadow` integer NOT NULL,
	`borders_widget_border_weight` integer NOT NULL,
	`borders_widget_corner_radius` integer NOT NULL,
	`fonts_body_text_bold` integer NOT NULL,
	`fonts_body_text_size` integer NOT NULL,
	`fonts_buttons_text_bold` integer NOT NULL,
	`fonts_buttons_text_size` integer NOT NULL,
	`fonts_font_url` text(255) NOT NULL,
	`fonts_input_labels_bold` integer NOT NULL,
	`fonts_input_labels_size` integer NOT NULL,
	`fonts_links_bold` integer NOT NULL,
	`fonts_links_size` integer NOT NULL,
	`fonts_links_style` text(24) NOT NULL,
	`fonts_reference_text_size` integer NOT NULL,
	`fonts_subtitle_bold` integer NOT NULL,
	`fonts_subtitle_size` integer NOT NULL,
	`fonts_title_bold` integer NOT NULL,
	`fonts_title_size` integer NOT NULL,
	`page_background_background_color` text(24) NOT NULL,
	`page_background_background_image_url` text(255) NOT NULL,
	`page_background_page_layout` text(24) NOT NULL,
	`widget_header_text_alignment` text(24) NOT NULL,
	`widget_logo_height` integer NOT NULL,
	`widget_logo_position` text(24) NOT NULL,
	`widget_logo_url` text(255) NOT NULL,
	`widget_social_buttons_layout` text(24) NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL,
	PRIMARY KEY(`tenant_id`, `themeId`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `themes_tenant_id_idx` ON `themes` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `logs` (
	`log_id` text(21) PRIMARY KEY NOT NULL,
	`category` text(255),
	`tenant_id` text(64),
	`user_id` text(64),
	`ip` text(255),
	`type` text(8) NOT NULL,
	`date` text(35) NOT NULL,
	`client_id` text(255),
	`client_name` text(255),
	`user_agent` text(255),
	`description` text(255),
	`details` text(2048),
	`isMobile` integer,
	`user_name` text(255),
	`connection` text(255),
	`connection_id` text(255),
	`audience` text(255),
	`scope` text(255),
	`strategy` text(255),
	`strategy_type` text(255),
	`hostname` text(255),
	`auth0_client` text(8192),
	`session_connection` text(255),
	`country_code` text(2),
	`city_name` text(255),
	`latitude` text(255),
	`longitude` text(255),
	`time_zone` text(255),
	`continent_code` text(2)
);
--> statement-breakpoint
CREATE INDEX `logs_user_id` ON `logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `logs_tenant_id` ON `logs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `logs_date` ON `logs` (`date`);--> statement-breakpoint
CREATE INDEX `IDX_logs_tenant_date_type_user` ON `logs` (`tenant_id`,`date`,`type`,`user_id`);