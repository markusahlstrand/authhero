-- Backfill login_sessions.expires_at_ts for active login sessions
--
-- With the new behavior where login_sessions.expires_at is extended on
-- refresh token exchange and silent auth, existing active login_sessions
-- still have their original 24-hour expiry and would be prematurely
-- cleaned up.
--
-- This script bumps expires_at_ts to 30 days from now for any login_session
-- that has at least one non-expired session or refresh token.
--
-- Run on PlanetScale after deploying the code change.

-- Step 1: Check how many login_sessions have active sessions but short expiry
SELECT COUNT(DISTINCT ls.id) AS via_sessions
FROM login_sessions ls
JOIN sessions s ON ls.id = s.login_session_id AND ls.tenant_id = s.tenant_id
WHERE ls.expires_at_ts < UNIX_TIMESTAMP() * 1000 + 30 * 24 * 60 * 60 * 1000
  AND (s.expires_at_ts > UNIX_TIMESTAMP() * 1000
    OR s.idle_expires_at_ts > UNIX_TIMESTAMP() * 1000);

-- Step 2: Check how many login_sessions have active refresh tokens but short expiry
SELECT COUNT(DISTINCT ls.id) AS via_refresh_tokens
FROM login_sessions ls
JOIN refresh_tokens rt ON ls.id = rt.login_id AND ls.tenant_id = rt.tenant_id
WHERE ls.expires_at_ts < UNIX_TIMESTAMP() * 1000 + 30 * 24 * 60 * 60 * 1000
  AND (rt.expires_at_ts > UNIX_TIMESTAMP() * 1000
    OR rt.idle_expires_at_ts > UNIX_TIMESTAMP() * 1000);

-- Step 3: Bump login_sessions that have active sessions
UPDATE login_sessions ls
JOIN sessions s ON ls.id = s.login_session_id AND ls.tenant_id = s.tenant_id
SET ls.expires_at_ts = UNIX_TIMESTAMP() * 1000 + 30 * 24 * 60 * 60 * 1000
WHERE ls.expires_at_ts < UNIX_TIMESTAMP() * 1000 + 30 * 24 * 60 * 60 * 1000
  AND (s.expires_at_ts > UNIX_TIMESTAMP() * 1000
    OR s.idle_expires_at_ts > UNIX_TIMESTAMP() * 1000);

-- Step 4: Bump login_sessions that have active refresh tokens
UPDATE login_sessions ls
JOIN refresh_tokens rt ON ls.id = rt.login_id AND ls.tenant_id = rt.tenant_id
SET ls.expires_at_ts = UNIX_TIMESTAMP() * 1000 + 30 * 24 * 60 * 60 * 1000
WHERE ls.expires_at_ts < UNIX_TIMESTAMP() * 1000 + 30 * 24 * 60 * 60 * 1000
  AND (rt.expires_at_ts > UNIX_TIMESTAMP() * 1000
    OR rt.idle_expires_at_ts > UNIX_TIMESTAMP() * 1000);

-- Step 5: Verify - count login_sessions that still have short expiry with active children
SELECT COUNT(DISTINCT ls.id) AS remaining
FROM login_sessions ls
LEFT JOIN sessions s ON ls.id = s.login_session_id AND ls.tenant_id = s.tenant_id
  AND (s.expires_at_ts > UNIX_TIMESTAMP() * 1000 OR s.idle_expires_at_ts > UNIX_TIMESTAMP() * 1000)
LEFT JOIN refresh_tokens rt ON ls.id = rt.login_id AND ls.tenant_id = rt.tenant_id
  AND (rt.expires_at_ts > UNIX_TIMESTAMP() * 1000 OR rt.idle_expires_at_ts > UNIX_TIMESTAMP() * 1000)
WHERE ls.expires_at_ts < UNIX_TIMESTAMP() * 1000 + 30 * 24 * 60 * 60 * 1000
  AND (s.id IS NOT NULL OR rt.id IS NOT NULL);
