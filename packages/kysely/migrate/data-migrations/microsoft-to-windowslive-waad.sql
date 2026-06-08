-- Data migration: split legacy `microsoft` strategy into Auth0's canonical
-- `windowslive` (consumer) and `waad` (enterprise) strategies.
--
-- WHAT IT DOES
--   1. Connections with strategy = 'microsoft':
--        - options.realms = tenant GUID, 'organizations', or 'common' → 'waad'
--        - options.realms = 'consumers' or absent                     → 'windowslive'
--   2. users.linked_to pointing at 'microsoft|...' identities is rewritten to
--      reference the primary user's new prefix.
--   3. users with provider = 'microsoft' are rewritten:
--        - provider       ← connection's new strategy
--        - user_id        ← '<new-strategy>|<sub>' (sub portion preserved)
--        - is_social      ← 1 for windowslive, 0 for waad
--   4. migration_sources with provider = 'microsoft' updated the same way as
--      users (provider only — no user_id rewrite needed).
--
-- ORDER MATTERS. Run the steps top-to-bottom. Step 2 must run before step 3
-- because it joins on the still-prefixed primary user_id to find the right
-- new prefix; step 3 then overwrites those primary user_ids.
--
-- IDEMPOTENCE: each step is gated by `WHERE provider = 'microsoft'` or
-- `WHERE strategy = 'microsoft'`, so re-running after success is a no-op.
--
-- BEFORE RUNNING
--   * Take a PlanetScale branch + backup.
--   * Run the SELECT preview queries at the bottom to confirm row counts.
--   * Wrap each step in BEGIN; COMMIT; if your client supports it (PlanetScale
--     supports DML transactions per session).
--
-- FOREIGN KEY NOTE
--   users.user_id is referenced by FK constraints from passwords, codes,
--   sessions, login_sessions, refresh_tokens, password_history, grants, and
--   users.linked_to. None of them are ON UPDATE CASCADE, so rewriting the
--   prefix on users.user_id will violate those FKs. Step 3 disables
--   FOREIGN_KEY_CHECKS for the session and rewrites the same prefix on every
--   child table in lockstep. Run all of step 3's statements in one session.

-- ──────────────────────────────────────────────────────────────────────────
-- Preview: how many rows will be touched?
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS microsoft_connections FROM connections WHERE strategy = 'microsoft';
-- SELECT COUNT(*) AS microsoft_users       FROM users       WHERE provider = 'microsoft';
-- SELECT COUNT(*) AS linked_to_microsoft   FROM users       WHERE linked_to LIKE 'microsoft|%';
-- SELECT COUNT(*) AS microsoft_migrations  FROM migration_sources WHERE provider = 'microsoft';

-- Preview the split:
-- SELECT
--   c.tenant_id, c.name, c.strategy,
--   JSON_UNQUOTE(JSON_EXTRACT(c.options, '$.realms')) AS realms,
--   CASE
--     WHEN JSON_UNQUOTE(JSON_EXTRACT(c.options, '$.realms'))
--          REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
--          THEN 'waad'
--     WHEN JSON_UNQUOTE(JSON_EXTRACT(c.options, '$.realms')) IN ('organizations', 'common')
--          THEN 'waad'
--     ELSE 'windowslive'
--   END AS new_strategy
-- FROM connections c
-- WHERE c.strategy = 'microsoft';


-- ──────────────────────────────────────────────────────────────────────────
-- Step 1: connections.strategy  'microsoft' → 'windowslive' | 'waad'
-- ──────────────────────────────────────────────────────────────────────────
UPDATE connections
SET strategy = CASE
  WHEN JSON_UNQUOTE(JSON_EXTRACT(options, '$.realms'))
       REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       THEN 'waad'
  WHEN JSON_UNQUOTE(JSON_EXTRACT(options, '$.realms')) IN ('organizations', 'common')
       THEN 'waad'
  ELSE 'windowslive'
END
WHERE strategy = 'microsoft';


-- ──────────────────────────────────────────────────────────────────────────
-- Step 2: users.linked_to  'microsoft|<sub>' → '<new-strategy>|<sub>'
-- (Must run BEFORE step 3 — uses the still-prefixed primary user_id to join.)
-- ──────────────────────────────────────────────────────────────────────────
UPDATE users child
JOIN users primary_u
  ON primary_u.tenant_id = child.tenant_id
 AND primary_u.user_id   = child.linked_to
JOIN connections c
  ON c.tenant_id = primary_u.tenant_id
 AND c.name      = primary_u.connection
SET child.linked_to = CONCAT(
  c.strategy, '|',
  SUBSTRING(child.linked_to, LOCATE('|', child.linked_to) + 1)
)
WHERE child.linked_to LIKE 'microsoft|%'
  AND c.strategy IN ('windowslive', 'waad');


-- ──────────────────────────────────────────────────────────────────────────
-- Step 3: users.provider / user_id / is_social  + child tables
--
-- Rewrites the 'microsoft|<sub>' prefix on users.user_id AND on every child
-- table that has an FK to users(user_id, tenant_id). FOREIGN_KEY_CHECKS is
-- disabled for this session so the parent + child updates can land without
-- a momentary referential violation. Run all of these statements in the
-- same connection.
-- ──────────────────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 0;

-- 3a. Child tables: rewrite their user_id prefix to match the new strategy.
--     Each is gated by the parent users row still being a 'microsoft|...' user
--     whose connection has been flipped to windowslive/waad.

UPDATE passwords p
JOIN users u        ON u.tenant_id = p.tenant_id AND u.user_id = p.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id AND c.name    = u.connection
SET p.user_id = CONCAT(c.strategy, '|', SUBSTRING(p.user_id, LOCATE('|', p.user_id) + 1))
WHERE p.user_id LIKE 'microsoft|%'
  AND u.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');

UPDATE codes ch
JOIN users u        ON u.tenant_id = ch.tenant_id AND u.user_id = ch.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id  AND c.name    = u.connection
SET ch.user_id = CONCAT(c.strategy, '|', SUBSTRING(ch.user_id, LOCATE('|', ch.user_id) + 1))
WHERE ch.user_id LIKE 'microsoft|%'
  AND u.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');

UPDATE sessions s
JOIN users u        ON u.tenant_id = s.tenant_id AND u.user_id = s.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id AND c.name    = u.connection
SET s.user_id = CONCAT(c.strategy, '|', SUBSTRING(s.user_id, LOCATE('|', s.user_id) + 1))
WHERE s.user_id LIKE 'microsoft|%'
  AND u.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');

UPDATE login_sessions ls
JOIN users u        ON u.tenant_id = ls.tenant_id AND u.user_id = ls.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id  AND c.name    = u.connection
SET ls.user_id = CONCAT(c.strategy, '|', SUBSTRING(ls.user_id, LOCATE('|', ls.user_id) + 1))
WHERE ls.user_id LIKE 'microsoft|%'
  AND u.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');

UPDATE refresh_tokens rt
JOIN users u        ON u.tenant_id = rt.tenant_id AND u.user_id = rt.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id  AND c.name    = u.connection
SET rt.user_id = CONCAT(c.strategy, '|', SUBSTRING(rt.user_id, LOCATE('|', rt.user_id) + 1))
WHERE rt.user_id LIKE 'microsoft|%'
  AND u.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');

UPDATE password_history ph
JOIN users u        ON u.tenant_id = ph.tenant_id AND u.user_id = ph.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id  AND c.name    = u.connection
SET ph.user_id = CONCAT(c.strategy, '|', SUBSTRING(ph.user_id, LOCATE('|', ph.user_id) + 1))
WHERE ph.user_id LIKE 'microsoft|%'
  AND u.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');

UPDATE grants g
JOIN users u        ON u.tenant_id = g.tenant_id AND u.user_id = g.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id AND c.name    = u.connection
SET g.user_id = CONCAT(c.strategy, '|', SUBSTRING(g.user_id, LOCATE('|', g.user_id) + 1))
WHERE g.user_id LIKE 'microsoft|%'
  AND u.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');

-- 3b. Parent users: rewrite provider, user_id prefix, is_social.

UPDATE users u
JOIN connections c
  ON c.tenant_id = u.tenant_id
 AND c.name      = u.connection
SET
  u.provider  = c.strategy,
  u.user_id   = CONCAT(c.strategy, '|', SUBSTRING(u.user_id, LOCATE('|', u.user_id) + 1)),
  u.is_social = IF(c.strategy = 'windowslive', 1, 0)
WHERE u.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');

SET FOREIGN_KEY_CHECKS = 1;


-- ──────────────────────────────────────────────────────────────────────────
-- Step 4: migration_sources.provider
-- ──────────────────────────────────────────────────────────────────────────
UPDATE migration_sources m
JOIN connections c
  ON c.tenant_id = m.tenant_id
 AND c.name      = m.connection
SET m.provider = c.strategy
WHERE m.provider = 'microsoft'
  AND c.strategy IN ('windowslive', 'waad');


-- ──────────────────────────────────────────────────────────────────────────
-- Verification: should all return 0 after a successful run.
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM connections       WHERE strategy = 'microsoft';
-- SELECT COUNT(*) FROM users             WHERE provider = 'microsoft';
-- SELECT COUNT(*) FROM users             WHERE user_id LIKE 'microsoft|%';
-- SELECT COUNT(*) FROM users             WHERE linked_to LIKE 'microsoft|%';
-- SELECT COUNT(*) FROM migration_sources WHERE provider = 'microsoft';

-- Orphan check: any leftover microsoft-prefixed user_ids where the connection
-- row was missing (won't be touched by step 3). Investigate manually.
-- SELECT u.tenant_id, u.user_id, u.connection
-- FROM users u
-- LEFT JOIN connections c
--   ON c.tenant_id = u.tenant_id AND c.name = u.connection
-- WHERE u.provider = 'microsoft' AND c.id IS NULL;
