-- One client grant per (tenant_id, client_id, audience) — the constraint
-- kysely has always enforced (same index name), which drizzle was missing
-- (#1360). Without it a duplicate pair is silently accepted and scope
-- resolution picks an arbitrary row.
--
-- Existing databases may already hold duplicates, so dedupe first: keep the
-- newest row per pair (latest created_at, then highest rowid).
DELETE FROM `client_grants` WHERE `rowid` IN (
	SELECT `rowid` FROM (
		SELECT `rowid`, ROW_NUMBER() OVER (
			PARTITION BY `tenant_id`, `client_id`, `audience`
			ORDER BY `created_at` DESC, `rowid` DESC
		) AS `rn`
		FROM `client_grants`
	)
	WHERE `rn` > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_client_grants_tenant_client_audience` ON `client_grants` (`tenant_id`,`client_id`,`audience`);
