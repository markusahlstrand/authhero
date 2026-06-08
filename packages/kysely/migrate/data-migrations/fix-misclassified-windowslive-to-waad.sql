-- Follow-up to microsoft-to-windowslive-waad.sql.
--
-- WHY
--   The original CASE only treated realms = GUID / 'organizations' / 'common'
--   as enterprise (waad). Connections whose realms is a verified DOMAIN
--   (e.g. 'sonymusic.com') — or where realms is absent but domain_aliases is
--   populated — fell through to the ELSE branch and were misclassified as
--   'windowslive'. Their users were also rewritten to 'windowslive|<sub>'
--   with is_social = 1.
--
-- WHAT IT DOES
--   1. Re-identifies enterprise connections currently sitting as 'windowslive'
--      and flips them to 'waad'.
--   2. Rewrites users.linked_to 'windowslive|<sub>' → 'waad|<sub>' for any
--      child whose primary user is on a now-flipped connection.
--   3. Rewrites users.provider / user_id / is_social on those connections.
--   4. Rewrites migration_sources.provider on those connections.
--
-- ENTERPRISE HEURISTIC (must match across all steps)
--   A 'windowslive' connection is treated as misclassified-waad when:
--     - options.realms is set AND not in ('consumers', 'null'), OR
--     - options.realms is absent AND options.domain_aliases is a non-empty array.
--
-- ORDER MATTERS. Same as the original: flip connections first (step 1) so
-- steps 2-4 can join via c.strategy = 'waad'.
--
-- IDEMPOTENCE: each step is gated by the heuristic + a 'windowslive' filter,
-- so re-running after success is a no-op.
--
-- BEFORE RUNNING
--   * Take a PlanetScale branch + backup.
--   * Run the SELECT preview queries below to confirm row counts.
--   * Wrap each step in BEGIN; COMMIT; if your client supports it.
--
-- FOREIGN KEY NOTE
--   Same situation as the original script: users.user_id is referenced by
--   FK constraints from passwords, codes, sessions, login_sessions,
--   refresh_tokens, password_history, grants, and users.linked_to. Step 3
--   disables FOREIGN_KEY_CHECKS for the session and rewrites the prefix on
--   the parent + every child table in lockstep. Run all of step 3's
--   statements in the same connection.

-- ──────────────────────────────────────────────────────────────────────────
-- Preview: which 'windowslive' connections will be re-flipped to 'waad'?
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT
--   c.tenant_id, c.name,
--   JSON_UNQUOTE(JSON_EXTRACT(c.options, '$.realms')) AS realms,
--   JSON_LENGTH(JSON_EXTRACT(c.options, '$.domain_aliases')) AS n_aliases
-- FROM connections c
-- WHERE c.strategy = 'windowslive'
--   AND (
--     (JSON_UNQUOTE(JSON_EXTRACT(c.options, '$.realms')) IS NOT NULL
--      AND JSON_UNQUOTE(JSON_EXTRACT(c.options, '$.realms')) NOT IN ('consumers', 'null'))
--     OR COALESCE(JSON_LENGTH(JSON_EXTRACT(c.options, '$.domain_aliases')), 0) > 0
--   );

-- Affected user counts:
-- SELECT COUNT(*) AS users_to_fix
-- FROM users u
-- JOIN connections c ON c.tenant_id = u.tenant_id AND c.name = u.connection
-- WHERE u.provider = 'windowslive'
--   AND c.strategy = 'windowslive'
--   AND (
--     (JSON_UNQUOTE(JSON_EXTRACT(c.options, '$.realms')) IS NOT NULL
--      AND JSON_UNQUOTE(JSON_EXTRACT(c.options, '$.realms')) NOT IN ('consumers', 'null'))
--     OR COALESCE(JSON_LENGTH(JSON_EXTRACT(c.options, '$.domain_aliases')), 0) > 0
--   );


-- ──────────────────────────────────────────────────────────────────────────
-- Step 1: connections.strategy  'windowslive' → 'waad' (enterprise only)
-- ──────────────────────────────────────────────────────────────────────────
UPDATE connections
SET strategy = 'waad'
WHERE strategy = 'windowslive'
  AND (
    (JSON_UNQUOTE(JSON_EXTRACT(options, '$.realms')) IS NOT NULL
     AND JSON_UNQUOTE(JSON_EXTRACT(options, '$.realms')) NOT IN ('consumers', 'null'))
    OR COALESCE(JSON_LENGTH(JSON_EXTRACT(options, '$.domain_aliases')), 0) > 0
  );


-- ──────────────────────────────────────────────────────────────────────────
-- Step 2: users.linked_to  'windowslive|<sub>' → 'waad|<sub>'
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
  'waad|',
  SUBSTRING(child.linked_to, LOCATE('|', child.linked_to) + 1)
)
WHERE child.linked_to LIKE 'windowslive|%'
  AND c.strategy = 'waad';


-- ──────────────────────────────────────────────────────────────────────────
-- Step 3: users.provider / user_id / is_social + child tables
--
-- Rewrites the 'windowslive|<sub>' prefix on users.user_id AND on every
-- child table that has an FK to users(user_id, tenant_id). Run all of
-- these statements in the same connection.
-- ──────────────────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 0;

UPDATE passwords p
JOIN users u        ON u.tenant_id = p.tenant_id AND u.user_id = p.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id AND c.name    = u.connection
SET p.user_id = CONCAT('waad|', SUBSTRING(p.user_id, LOCATE('|', p.user_id) + 1))
WHERE p.user_id LIKE 'windowslive|%'
  AND u.provider = 'windowslive'
  AND c.strategy = 'waad';

UPDATE codes ch
JOIN users u        ON u.tenant_id = ch.tenant_id AND u.user_id = ch.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id  AND c.name    = u.connection
SET ch.user_id = CONCAT('waad|', SUBSTRING(ch.user_id, LOCATE('|', ch.user_id) + 1))
WHERE ch.user_id LIKE 'windowslive|%'
  AND u.provider = 'windowslive'
  AND c.strategy = 'waad';

UPDATE sessions s
JOIN users u        ON u.tenant_id = s.tenant_id AND u.user_id = s.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id AND c.name    = u.connection
SET s.user_id = CONCAT('waad|', SUBSTRING(s.user_id, LOCATE('|', s.user_id) + 1))
WHERE s.user_id LIKE 'windowslive|%'
  AND u.provider = 'windowslive'
  AND c.strategy = 'waad';

UPDATE login_sessions ls
JOIN users u        ON u.tenant_id = ls.tenant_id AND u.user_id = ls.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id  AND c.name    = u.connection
SET ls.user_id = CONCAT('waad|', SUBSTRING(ls.user_id, LOCATE('|', ls.user_id) + 1))
WHERE ls.user_id LIKE 'windowslive|%'
  AND u.provider = 'windowslive'
  AND c.strategy = 'waad';

UPDATE refresh_tokens rt
JOIN users u        ON u.tenant_id = rt.tenant_id AND u.user_id = rt.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id  AND c.name    = u.connection
SET rt.user_id = CONCAT('waad|', SUBSTRING(rt.user_id, LOCATE('|', rt.user_id) + 1))
WHERE rt.user_id LIKE 'windowslive|%'
  AND u.provider = 'windowslive'
  AND c.strategy = 'waad';

UPDATE password_history ph
JOIN users u        ON u.tenant_id = ph.tenant_id AND u.user_id = ph.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id  AND c.name    = u.connection
SET ph.user_id = CONCAT('waad|', SUBSTRING(ph.user_id, LOCATE('|', ph.user_id) + 1))
WHERE ph.user_id LIKE 'windowslive|%'
  AND u.provider = 'windowslive'
  AND c.strategy = 'waad';

UPDATE grants g
JOIN users u        ON u.tenant_id = g.tenant_id AND u.user_id = g.user_id
JOIN connections c  ON c.tenant_id = u.tenant_id AND c.name    = u.connection
SET g.user_id = CONCAT('waad|', SUBSTRING(g.user_id, LOCATE('|', g.user_id) + 1))
WHERE g.user_id LIKE 'windowslive|%'
  AND u.provider = 'windowslive'
  AND c.strategy = 'waad';

UPDATE users u
JOIN connections c
  ON c.tenant_id = u.tenant_id
 AND c.name      = u.connection
SET
  u.provider  = 'waad',
  u.user_id   = CONCAT('waad|', SUBSTRING(u.user_id, LOCATE('|', u.user_id) + 1)),
  u.is_social = 0
WHERE u.provider = 'windowslive'
  AND c.strategy = 'waad';

SET FOREIGN_KEY_CHECKS = 1;


-- ──────────────────────────────────────────────────────────────────────────
-- Step 4: migration_sources.provider on flipped connections
-- ──────────────────────────────────────────────────────────────────────────
UPDATE migration_sources m
JOIN connections c
  ON c.tenant_id = m.tenant_id
 AND c.name      = m.connection
SET m.provider = 'waad'
WHERE m.provider = 'windowslive'
  AND c.strategy = 'waad';


-- ──────────────────────────────────────────────────────────────────────────
-- Verification: should all return 0 after a successful run.
-- ──────────────────────────────────────────────────────────────────────────
-- Any remaining 'windowslive' connections that look enterprise?
-- SELECT COUNT(*) FROM connections
-- WHERE strategy = 'windowslive'
--   AND (
--     (JSON_UNQUOTE(JSON_EXTRACT(options, '$.realms')) IS NOT NULL
--      AND JSON_UNQUOTE(JSON_EXTRACT(options, '$.realms')) NOT IN ('consumers', 'null'))
--     OR COALESCE(JSON_LENGTH(JSON_EXTRACT(options, '$.domain_aliases')), 0) > 0
--   );

-- Any users still on 'windowslive' whose connection is now 'waad'?
-- SELECT COUNT(*) FROM users u
-- JOIN connections c ON c.tenant_id = u.tenant_id AND c.name = u.connection
-- WHERE u.provider = 'windowslive' AND c.strategy = 'waad';

-- Any windowslive-prefixed user_ids left on waad connections?
-- SELECT COUNT(*) FROM users u
-- JOIN connections c ON c.tenant_id = u.tenant_id AND c.name = u.connection
-- WHERE u.user_id LIKE 'windowslive|%' AND c.strategy = 'waad';

-- Stray linked_to references:
-- SELECT COUNT(*) FROM users child
-- JOIN users primary_u
--   ON primary_u.tenant_id = child.tenant_id AND primary_u.user_id = child.linked_to
-- JOIN connections c
--   ON c.tenant_id = primary_u.tenant_id AND c.name = primary_u.connection
-- WHERE child.linked_to LIKE 'windowslive|%' AND c.strategy = 'waad';
