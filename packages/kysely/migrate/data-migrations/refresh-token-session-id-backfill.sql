-- Data migration: backfill the refresh_tokens auth-event columns added by
-- 2026-08-20T12:00:00_refresh_token_session_id.
--
-- WHY
--   `session_id`, `organization`, `auth_connection` and the two
--   `auth_strategy_*` columns are denormalised from the parent login session
--   at mint time so the refresh grant stops resolving them through a
--   short-lived row. Tokens minted before that release carry none of them and
--   still resolve through `login_sessions` (see the `hasDenormalisedFacts`
--   branch in authentication-flows/refresh-token.ts).
--
--   That fallback works only while the parent row survives. Once
--   `login_sessions` retention starts running, the facts are gone for good.
--   THIS MUST LAND BEFORE login_sessions PRUNING IS ENABLED.
--
--   It is deliberately not a Kysely chain migration. migrateToLatest runs on
--   Cloudflare Workers, where every PlanetScale query is a subrequest against
--   a 1,000-per-request cap, and a row-at-a-time backfill of this size cannot
--   finish inside one invocation.
--
-- WHAT IT DOES
--   Copies five facts from `login_sessions` onto every refresh token that is
--   still exchangeable and whose parent session survives.
--
--   All five are written together, or none are. The refresh grant treats
--   `session_id` as the marker for "this row carries its own facts" and skips
--   the login-session read when it is set, so setting `session_id` alone would
--   make the grant stop looking up the organization and connection it still
--   needs. The `ls.session_id IS NOT NULL` predicate keeps the marker from
--   ever running ahead of the data.
--
-- SCOPE — only live tokens
--   Rows that are rotated away, revoked, or expired are skipped. They can
--   never be exchanged again, so the denormalised facts buy nothing, and
--   createSessionCleanup deletes expired ones a week past expiry anyway —
--   the same sweep that prunes the login_sessions this reads from. As of
--   2026-08-24 that is ~179k rows in scope out of ~597k unpopulated.
--
--   Rows whose parent is already gone stay null, which is correct: they are
--   indistinguishable from a token that never had a session, and Auth0
--   represents the same state with a null `session_id`.
--
-- IDEMPOTENCE
--   Every step is gated on `rt.session_id IS NULL`, so updated rows drop out
--   of the predicate. Re-running after a success is a no-op; re-running after
--   an interrupted run picks up exactly where it stopped.
--
-- VERIFIED (2026-08-24, MySQL 8.4 in Docker, not against Vitess)
--   Seeded 597k refresh_tokens / 580k login_sessions with 238,800 rows in
--   scope, matching the prod shape. The loop below completed in 49 statements
--   and 14 seconds, with per-batch cost flat from first batch to last —
--   updated rows drop out of the predicate, so there is no re-scan growth.
--   Re-running afterwards reported 0 rows affected.
--
--   Edge cases confirmed row by row: malformed auth_params keeps the other
--   four facts and nulls the organization without aborting the batch; a NULL
--   auth_params, a missing parent, a parent with no session_id, and a token
--   whose login_id exists only under a different tenant are all left
--   untouched; rotated / revoked / expired rows are never written.
--
--   Confirmed against production PlanetScale on 2026-08-24: Vitess accepts
--   the multi-table UPDATE as written, and successive runs drew the in-scope
--   count down as expected (178,975 -> 163,625 -> 142,177 over the first few
--   batches, the surplus beyond 5,000/batch being live churn — see below).
--
-- BEFORE RUNNING
--   * Take a PlanetScale branch + backup.
--   * Prefer off-peak. The rows in scope are live tokens that the refresh
--     grant may be exchanging concurrently; each statement holds row locks
--     for its duration. Drop the batch to 1000 if you hit lock wait timeouts.
--   * Run the step 0 preview to confirm row counts.
--   * Check whether the chain migration
--     2026-08-21T12:00:00_refresh_token_session_id_backfill is sitting failed
--     or pending in `kysely_migration` — if it is, it has been retrying on
--     every deploy and should be neutralised before this runs.


-- ---------------------------------------------------------------------------
-- Step 0: preview. No writes.
-- ---------------------------------------------------------------------------

SELECT rt.tenant_id, COUNT(*) AS rows_in_scope
FROM refresh_tokens rt
JOIN login_sessions ls
  ON ls.tenant_id = rt.tenant_id AND ls.id = rt.login_id
WHERE rt.session_id IS NULL
  AND ls.session_id IS NOT NULL
  AND rt.rotated_to IS NULL
  AND rt.revoked_at_ts IS NULL
  AND (rt.expires_at_ts IS NULL OR rt.expires_at_ts > UNIX_TIMESTAMP(NOW(3)) * 1000)
GROUP BY rt.tenant_id
ORDER BY rows_in_scope DESC;


-- ---------------------------------------------------------------------------
-- Step 1: the backfill. Run repeatedly until it reports 0 rows affected.
--
-- Do NOT compute a batch count from the step 0 total and run that many times.
-- The in-scope set shrinks from two directions at once: this statement, and
-- ordinary churn as tokens rotate, are revoked, or expire out of scope. On
-- prod the churn ran to several thousand rows between consecutive batches.
-- Nothing ever enters the set — tokens minted since the 2026-08-20 release
-- already carry session_id — so looping to zero always terminates.
--
-- Batched through a derived table because MySQL forbids LIMIT on a
-- multi-table UPDATE. 5,000 keeps each statement well inside PlanetScale's
-- query timeout; lower it if you see timeouts on a wide tenant.
--
-- The LIMIT is batch size only. Verified on MySQL 8.4: the statement is also
-- legal without it (a derived table in a multi-table UPDATE does not trip the
-- "target table specified twice" restriction, errno 1093, that a WHERE-clause
-- subquery would). Keep it anyway so each statement stays bounded.
--
-- Multi-table UPDATE requires an unsharded keyspace on PlanetScale. If this
-- ever runs against a sharded one, fall back to driving the same five
-- assignments from a per-tenant id list.
--
-- The organization lives inside the login session's JSON `auth_params`.
-- JSON_VALID guards the extract: on MySQL 8 a bare JSON_EXTRACT over
-- malformed text raises an error and would abort the whole batch, where the
-- intended behaviour is to keep the other four facts and treat a broken
-- organization as absent — which is how the grant reads a NULL.
-- ---------------------------------------------------------------------------

UPDATE refresh_tokens rt
JOIN (
  SELECT rt2.tenant_id, rt2.id
  FROM refresh_tokens rt2
  JOIN login_sessions ls2
    ON ls2.tenant_id = rt2.tenant_id AND ls2.id = rt2.login_id
  WHERE rt2.session_id IS NULL
    AND ls2.session_id IS NOT NULL
    AND rt2.rotated_to IS NULL
    AND rt2.revoked_at_ts IS NULL
    AND (rt2.expires_at_ts IS NULL OR rt2.expires_at_ts > UNIX_TIMESTAMP(NOW(3)) * 1000)
  LIMIT 5000
) AS batch
  ON batch.tenant_id = rt.tenant_id AND batch.id = rt.id
JOIN login_sessions ls
  ON ls.tenant_id = rt.tenant_id AND ls.id = rt.login_id
SET rt.session_id                  = ls.session_id,
    rt.organization                = CASE
                                       WHEN JSON_VALID(ls.auth_params)
                                       THEN JSON_UNQUOTE(
                                              JSON_EXTRACT(ls.auth_params, '$.organization'))
                                     END,
    rt.auth_connection             = ls.auth_connection,
    rt.auth_strategy_strategy      = ls.auth_strategy_strategy,
    rt.auth_strategy_strategy_type = ls.auth_strategy_strategy_type
WHERE rt.session_id IS NULL
  AND ls.session_id IS NOT NULL
  AND rt.rotated_to IS NULL
  AND rt.revoked_at_ts IS NULL
  AND (rt.expires_at_ts IS NULL OR rt.expires_at_ts > UNIX_TIMESTAMP(NOW(3)) * 1000);


-- ---------------------------------------------------------------------------
-- Step 2: verify. Both should return 0.
-- ---------------------------------------------------------------------------

-- Nothing left in scope.
SELECT COUNT(*) AS remaining
FROM refresh_tokens rt
JOIN login_sessions ls
  ON ls.tenant_id = rt.tenant_id AND ls.id = rt.login_id
WHERE rt.session_id IS NULL
  AND ls.session_id IS NOT NULL
  AND rt.rotated_to IS NULL
  AND rt.revoked_at_ts IS NULL
  AND (rt.expires_at_ts IS NULL OR rt.expires_at_ts > UNIX_TIMESTAMP(NOW(3)) * 1000);

-- The marker never ran ahead of the data: no row carries a session_id while
-- its parent still holds a connection this did not copy across.
SELECT COUNT(*) AS marker_ahead_of_data
FROM refresh_tokens rt
JOIN login_sessions ls
  ON ls.tenant_id = rt.tenant_id AND ls.id = rt.login_id
WHERE rt.session_id IS NOT NULL
  AND rt.auth_connection IS NULL
  AND ls.auth_connection IS NOT NULL;
