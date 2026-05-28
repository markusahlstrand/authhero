CREATE TABLE `proxy_routes` (
	`id` text(64) PRIMARY KEY NOT NULL,
	`tenant_id` text(255) NOT NULL,
	`custom_domain_id` text(256) NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`path_pattern` text(512) NOT NULL,
	`upstream_type` text(32) NOT NULL,
	`upstream_url` text(2048) NOT NULL,
	`preserve_host` integer DEFAULT 0 NOT NULL,
	`middleware` text(8192) DEFAULT '[]' NOT NULL,
	`created_at` text(35) NOT NULL,
	`updated_at` text(35) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `proxy_routes_tenant_id_idx` ON `proxy_routes` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `proxy_routes_custom_domain_id_idx` ON `proxy_routes` (`custom_domain_id`);
