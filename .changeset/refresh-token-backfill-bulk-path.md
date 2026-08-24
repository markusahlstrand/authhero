---
"@authhero/kysely-adapter": patch
---

Make the refresh_tokens session_id backfill size-aware, and add a bulk SQL path.

The chain migration backfilled row-at-a-time, which cannot complete on a large
PlanetScale deployment: it is one query per row against the Cloudflare Workers
1,000-subrequest cap, and its unordered page query re-scanned the table on every
batch. It now measures the in-scope row count first, backfills in-process only
below a threshold that fits inside one Worker invocation, and otherwise logs the
location of the bulk path and completes instead of failing the whole chain on
every deploy.

The bulk path is a new set-based data migration at
`migrate/data-migrations/refresh-token-session-id-backfill.sql`. It is scoped to
tokens that are still exchangeable — rotated, revoked and expired rows are
skipped, since retention deletes them anyway — and guards the organization
extract with `JSON_VALID` so one malformed `auth_params` cannot abort a batch.
