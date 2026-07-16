---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
"authhero": minor
---

Give `codes` a retention story so the table stops growing without bound (#1155).

`codes` rows are short-lived by design but nothing ever pruned them, so every deployment accumulated them forever — one real deployment reached ~2.5M rows of which essentially 100% were expired.

- `CodesAdapter` gains a required `cleanup(olderThan)` method, and `authhero` exports a `cleanupCodes(codes, { retentionDays })` helper to drive it from a scheduled handler, mirroring `cleanupOutbox`. **If you maintain a custom adapter, you must implement `cleanup`.**
- The kysely adapter gains a `2026-07-16T12:00:00_codes_expires_at_ts` migration adding an indexed numeric `expires_at_ts` twin of `expires_at`, so sweeps no longer scan the table. It prunes already-expired rows *before* adding the index, so it stays cheap on a table that has already grown large, and backfills the small remainder.
- The drizzle adapter sweeps its existing indexed `expires_at` column and needs no migration. The AWS adapter is a no-op — DynamoDB already expires codes via a native `ttl`.

Scheduling `cleanupCodes` is what keeps the table in check; the migration is a one-time catch-up. See the new Data Retention deployment guide for the full set of tables that need sweeping.
