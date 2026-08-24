-- Reparent refresh tokens onto sessions (stage 2).
--
-- `session_id` is Auth0's field of the same name: the authenticated session a
-- token was issued under. Deliberately NOT a foreign key — a refresh token is
-- expected to outlive its session, so cleanup removes the session row first
-- and this pointer is left to dangle rather than cascading.
--
-- The rest are auth-event facts denormalised from the login session at mint
-- time, so the refresh grant stops resolving them through a short-lived row
-- that may already have been cleaned up.
ALTER TABLE `refresh_tokens` ADD `session_id` text(26);--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `organization` text(191);--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `auth_connection` text(255);--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `auth_strategy_strategy` text(64);--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD `auth_strategy_strategy_type` text(64);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_session_id` ON `refresh_tokens` (`tenant_id`,`session_id`);
