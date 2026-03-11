-- Backfill refresh_tokens.login_id from sessions.login_session_id
--
-- This populates login_id on existing refresh tokens by joining
-- through session_id → sessions.login_session_id.
--
-- Run in batches to avoid long-running transactions on PlanetScale.
-- Adjust the LIMIT if needed.
--
-- Stage 2 of the migration described in REFRESH_TOKEN_LOGIN_ID_MIGRATION.md

-- Step 1: Check how many rows need backfilling
SELECT COUNT(*) AS tokens_to_backfill
FROM refresh_tokens
WHERE login_id IS NULL;

-- Step 2: Backfill in batches of 10,000
-- Re-run this statement until 0 rows are affected (~13 times).
UPDATE refresh_tokens rt
JOIN sessions s ON rt.session_id = s.id AND rt.tenant_id = s.tenant_id
SET rt.login_id = s.login_session_id
WHERE rt.login_id IS NULL
  AND s.login_session_id IS NOT NULL
  AND rt.id IN (
    SELECT id FROM (
      SELECT rt2.id
      FROM refresh_tokens rt2
      WHERE rt2.login_id IS NULL
      LIMIT 10000
    ) tmp
  );

-- Step 3: Verify remaining rows (should be 0 or only orphaned tokens)
SELECT COUNT(*) AS remaining_null_login_id
FROM refresh_tokens
WHERE login_id IS NULL;

-- Step 4: Check for orphaned tokens (no matching session or session has no login_session_id)
SELECT COUNT(*) AS orphaned_tokens
FROM refresh_tokens rt
LEFT JOIN sessions s ON rt.session_id = s.id AND rt.tenant_id = s.tenant_id
WHERE rt.login_id IS NULL
  AND (s.id IS NULL OR s.login_session_id IS NULL);
