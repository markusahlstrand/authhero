---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
---

Add Auth0-compatible bulk user import (`POST /api/v2/jobs/users-imports`, `GET /api/v2/jobs/{id}`, `GET /api/v2/jobs/{id}/errors`) with bcrypt password-hash support.

Users are staged as individual `tenant_operation_rows` checkpoints and processed in chunks that commit before advancing, so an import survives a driver dying mid-run: `resumeUsersImports()` picks up any unfinished job and resumes it from the last committed chunk. Wire it to a scheduled handler alongside `runRetention()`, which now also deletes finished jobs after 24 hours.

bcrypt is the only importable algorithm, since it is the only one AuthHero can verify. Other Auth0 algorithms fail per row with `UNSUPPORTED_HASH_ALGORITHM` rather than rejecting the file, so a mixed export still imports its bcrypt majority.

New `init()` options `usersImportMaxBytes` (default 500 KB) and `usersImportMaxConcurrentJobs` (default 2) match Auth0's limits out of the box and can be raised for a large migration. `runRetention()` accepts `usersImportRetentionHours` (default 24).

`tenantOperations.engine` is widened from a closed enum to an open string, so a deployment can record its own driver instead of being limited to the two AuthHero ships. `tenant_operations` also gains `input`, `result`, and lease columns (`claimed_by`, `claim_expires_at`), plus `claim`/`release`/`listResumable` on the adapter.
