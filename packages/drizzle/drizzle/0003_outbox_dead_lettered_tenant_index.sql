CREATE INDEX `idx_outbox_events_tenant_dead_lettered` ON `outbox_events` (`tenant_id`,`dead_lettered_at`);
