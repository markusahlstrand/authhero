---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
---

Make the outbox transactional: hook events now commit atomically with the user write (#1057).

Previously the `hook.post-user-registration` / `hook.post-user-deletion` outbox event was written as a standalone insert _after_ the user commit closed, then awaited by the outbox middleware with `Promise.allSettled` + `console.error`. A failed enqueue — or a worker crash/eviction between the two writes — silently dropped the event, so the outbox pattern's defining guarantee ("business row and event row commit together or not at all") did not hold.

- **adapter-interfaces**: `rawCreate`, `update`, and `remove` accept an optional `WriteOptions.outboxEvents` (a new `OutboxEventInsert` — an audit event with a caller-assigned `id`). Adapters must persist these in the same atomic unit as the business write.
- **drizzle**: the companion outbox insert is appended to the existing `runAtomic` batch, so on D1 the user row and its event land in a single `db.batch()` (and one `BEGIN/COMMIT` on better-sqlite3). Also fixes a latent bug where `outbox.create` wrote `undefined` into the NOT NULL `aggregate_type`/`aggregate_id` columns — these now derive from the event's `target`, matching kysely.
- **kysely**: the companion event is inserted inside the same transaction as the user write.
- **authhero**: the post-registration event is built in `commitUserHook` from the committed user and the post-deletion event is passed into `remove`, then relayed for delivery only after the write commits. A race-loser whose `rawCreate` rolls back no longer strands an event. When the outbox is not configured, dispatch still falls back to inline webhook invocation.

Behavior change: the `hook.post-user-registration` payload now describes the committed user rather than the post-template-hook result, so mutations made by post-registration hooks (e.g. `account-linking`) are no longer reflected in that event's payload.
