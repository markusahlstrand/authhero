---
"@authhero/drizzle": minor
---

Implement the actions feature in the Drizzle adapter. The previously-stubbed `actions`, `actionVersions`, and `actionExecutions` adapters are now fully implemented against three new tables (`actions`, `action_versions`, `action_executions`), matching the Kysely backend: action CRUD with `q` filtering, sequential per-action version numbering with single-deployed-version semantics, and execution create/get with results/logs round-tripping. Tenants using the Drizzle adapter can now use actions without falling back to Kysely.

The Drizzle migrations have been consolidated into a single fresh `0000_init` baseline (the previous incremental migrations and their drifted drizzle-kit snapshots are removed). This is safe because no Drizzle databases are in production yet; any local Drizzle database must be recreated from the new baseline.
