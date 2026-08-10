---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
---

Add retention cleanup for action_executions

The `action_executions` table grew without bound: a row is written for every
action execution and nothing ever pruned them.

- `ActionExecutionsAdapter` gains an optional `cleanup(olderThan)` method.
  Optional because some backends (DynamoDB TTL, Analytics Engine) expire rows
  themselves.
- The kysely and drizzle adapters implement it as an indexed, chunked delete
  on `created_at_ts`, with a migration adding the index each was missing.
- `runRetention` now sweeps `action_executions` (default: 30 days of history),
  skipping adapters without `cleanup`. A standalone `cleanupActionExecutions`
  helper is exported for deployments that sweep tables on separate schedules.
