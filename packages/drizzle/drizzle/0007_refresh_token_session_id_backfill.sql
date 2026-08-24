-- Backfill the auth-event columns added by 0006, for refresh tokens minted
-- before that release started populating them at write time.
--
-- Values come from the token's parent `login_sessions` row. Tokens whose
-- parent has already been cleaned up are left null, which is correct: they are
-- indistinguishable from a token that never had a session, and Auth0
-- represents the same state with a null `session_id`.
--
-- IMPORTANT: all four facts are written together, or none are. The refresh
-- grant uses `session_id` as the marker for "this row carries its own facts"
-- and skips the login-session read when it is set — so setting `session_id`
-- alone would make the grant stop looking up the organization and connection
-- it still needs. The `ls.session_id IS NOT NULL` predicate keeps the marker
-- from ever running ahead of the data.
--
-- Single statement rather than batched: these are per-tenant D1 databases, so
-- the row counts are small. The PlanetScale equivalent batches, in
-- packages/kysely/migrate/migrations/2026-08-21T12:00:00_*_backfill.ts.
UPDATE `refresh_tokens`
SET
  `session_id` = (
    SELECT `ls`.`session_id` FROM `login_sessions` `ls`
    WHERE `ls`.`id` = `refresh_tokens`.`login_id`
      AND `ls`.`tenant_id` = `refresh_tokens`.`tenant_id`
  ),
  `organization` = (
    SELECT json_extract(`ls`.`auth_params`, '$.organization') FROM `login_sessions` `ls`
    WHERE `ls`.`id` = `refresh_tokens`.`login_id`
      AND `ls`.`tenant_id` = `refresh_tokens`.`tenant_id`
  ),
  `auth_connection` = (
    SELECT `ls`.`auth_connection` FROM `login_sessions` `ls`
    WHERE `ls`.`id` = `refresh_tokens`.`login_id`
      AND `ls`.`tenant_id` = `refresh_tokens`.`tenant_id`
  ),
  `auth_strategy_strategy` = (
    SELECT `ls`.`auth_strategy_strategy` FROM `login_sessions` `ls`
    WHERE `ls`.`id` = `refresh_tokens`.`login_id`
      AND `ls`.`tenant_id` = `refresh_tokens`.`tenant_id`
  ),
  `auth_strategy_strategy_type` = (
    SELECT `ls`.`auth_strategy_strategy_type` FROM `login_sessions` `ls`
    WHERE `ls`.`id` = `refresh_tokens`.`login_id`
      AND `ls`.`tenant_id` = `refresh_tokens`.`tenant_id`
  )
WHERE `refresh_tokens`.`session_id` IS NULL
  AND EXISTS (
    SELECT 1 FROM `login_sessions` `ls`
    WHERE `ls`.`id` = `refresh_tokens`.`login_id`
      AND `ls`.`tenant_id` = `refresh_tokens`.`tenant_id`
      AND `ls`.`session_id` IS NOT NULL
  );
