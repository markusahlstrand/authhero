---
title: Data Retention
description: Which AuthHero tables grow without bound, and the scheduled sweeps that keep them in check.
---

# Data Retention

Several AuthHero tables hold rows that are only useful for a short window — a code that expires in minutes, a session that expires in weeks, an outbox event that has already been delivered. Nothing deletes these rows as a side effect of normal traffic, so **a deployment without a scheduled sweep accumulates them forever**.

Retention is **one scheduled call**: `runRetention`. Schedule it and you are done — including for prunable tables added in future AuthHero versions, which it picks up without any change to your handler.

## Schedule this

```ts
import { runRetention } from "authhero";

export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    const { sweeps } = await runRetention({ dataAdapter });
    console.log(sweeps);
  },
};
```

Daily is a reasonable cadence.

`runRetention` sweeps every prunable table, using the default window for each:

| Table(s) | Default window | Notes |
| --- | --- | --- |
| `codes` | 1 day past expiry | Authorization codes, OTPs, OAuth2 state, email-verification and password-reset codes. Highest-churn table in the system. |
| `outbox_events` | 7 days after processing | Only processed and dead-lettered events are removed. Skipped when the adapter has no `outbox`. |
| `sessions`, `refresh_tokens`, `login_sessions` | 1 week past expiry (fixed grace period) | Skipped when the adapter does not implement `sessionCleanup`. |

Codes and outbox events are swept globally; they are not tenant-scoped, because an expired row is dead regardless of who owns it. Pass `tenantId` to scope the session sweep to one tenant.

Override the windows per table when you need to:

```ts
await runRetention({
  dataAdapter,
  codesRetentionDays: 1,
  outboxRetentionDays: 30,
});
```

### What it returns, and what it throws

`runRetention` resolves to `{ sweeps }` — one entry per table with a `swept` / `skipped` / `failed` status and, where the adapter reports one, a `deleted` count. Logging it gives you a retention record per run.

Every sweep runs even if an earlier one throws, so a single broken adapter method cannot stop the other tables being pruned. If any sweep failed, a `RetentionSweepError` is thrown once at the end, carrying `.result` (the partial sweep list) and `.errors`.

## What it does not cover

**Outbox delivery.** `runRetention` cleans up `outbox_events` but does not *drain* them. Delivery is [`runOutboxRelay`](./outbox-cron)'s job and is scheduled separately. Running both is safe — the relay's own cleanup pass and this one are idempotent.

**`logs`.** Audit-retention obligations differ per deployment, so AuthHero will not silently delete audit rows on your behalf. Prune `logs` on `date` yourself, on whatever window your obligations require.

## Per-table escape hatches

The individual helpers remain exported for consumers who want to sweep a single table, or run tables on different schedules:

```ts
import { cleanupCodes, cleanupOutbox } from "authhero";

await cleanupCodes(dataAdapter.codes, { retentionDays: 1 });
await cleanupOutbox(dataAdapter.outbox, { retentionDays: 7 });
await dataAdapter.sessionCleanup?.();
```

`runRetention` is the recommended default; reach for these only when you have a reason.

## Why `codes` has a grace period

`codes` rows are dead the moment they pass `expires_at`, so the default one-day window is not a retention policy so much as a safety margin against clock skew — and it keeps a recently expired code around long enough to debug a failed login. Setting `retentionDays: 0` is valid and sweeps everything already expired.

## Adapter behaviour

- **Drizzle** sweeps `codes` using the indexed ISO-8601 `expires_at` column directly.
- **Kysely** sweeps using `expires_at_ts`, a numeric twin of `expires_at` added by the `2026-07-16T12:00:00_codes_expires_at_ts` migration. That migration also prunes whatever had already accumulated, so the first deploy after upgrading clears the backlog.
- **DynamoDB (AWS)** needs no sweep: codes carry a native `ttl` attribute and DynamoDB expires them itself. `cleanup()` is a no-op returning `0`, so the handler above is safe to run unchanged.

## If you are upgrading an existing deployment

The kysely migration prunes expired codes before it adds the index, so it stays cheap even on a table that has grown to millions of rows. It logs what it removed. Once it has run, the scheduled `runRetention` call is what stops the table growing again — the migration is a one-time catch-up, not a substitute for the cron. A deployment that runs the migration but never schedules the sweep will regrow the table, with the one-time prune masking it for weeks.
