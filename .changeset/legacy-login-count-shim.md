---
"@authhero/kysely-adapter": patch
---

Keep user creation working on databases that have not yet run the o080 drop migration. On those schemas users.login_count still exists as NOT NULL without a default, so the post-#1003 insert (which omits it) fails on MySQL strict mode with errno 1364. create() now detects the legacy column from the failed insert, retries with login_count supplied, and caches the schema state per Kysely instance — flipping back automatically once the column is dropped, so the o080 migration can run later without a coordinated deploy.
