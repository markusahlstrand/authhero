---
"@authhero/kysely-adapter": patch
---

Make session cleanup actually delete on MySQL. The `refresh_tokens` and `sessions` sweeps each ran one DELETE with `expires_at_ts < c OR idle_expires_at_ts < c`; MySQL will not index_merge across the OR, so both statements fell back to a full table scan and were killed by PlanetScale's statement timeout. Each expiry column now gets its own single-predicate statement, the same split `codes/cleanup.ts` already documents. Each sweep also has its own `try/catch`, so a statement that times out no longer aborts the whole run, and `login_sessions` is swept first because `login_sessions_session_fk` is `ON DELETE CASCADE` and draining the child table first makes the `sessions` batches far cheaper.
