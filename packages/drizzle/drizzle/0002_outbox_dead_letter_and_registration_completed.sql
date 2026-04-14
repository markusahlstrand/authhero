ALTER TABLE `outbox_events` ADD `dead_lettered_at` text(35);--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `final_error` text;--> statement-breakpoint
ALTER TABLE `users` ADD `registration_completed_at` text(35);
