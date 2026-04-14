ALTER TABLE `outbox_events` ADD `dead_lettered_at` text(35);--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `final_error` text;--> statement-breakpoint
ALTER TABLE `users` ADD `registration_completed_at` text(35);--> statement-breakpoint
-- Backfill so legacy users don't re-fire post-user-registration on their
-- next login. The null/non-null state is load-bearing (see
-- postUserLoginHook); the exact timestamp is not exposed externally.
UPDATE `users` SET `registration_completed_at` = `created_at` WHERE `registration_completed_at` IS NULL;
