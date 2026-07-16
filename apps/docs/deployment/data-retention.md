---
title: Data Retention
description: Which AuthHero tables grow without bound, and the scheduled sweeps that keep them in check.
---

# Data Retention

Several AuthHero tables hold rows that are only useful for a short window — a code that expires in minutes, a session that expires in weeks, an outbox event that has already been delivered. Nothing deletes these rows as a side effect of normal traffic, so **a deployment without a scheduled sweep accumulates them forever**.

This is easy to miss because retention responsibility differs per table. This page is the full list.

## What you must schedule

| Table(s) | Swept by | Default window | Notes |
| --- | --- | --- | --- |
| `codes` | `cleanupCodes(data.codes, { retentionDays })` | 1 day past expiry | Authorization codes, OTPs, OAuth2 state, email-verification and password-reset codes. Highest-churn table in the system. |
| `outbox_events` | `cleanupOutbox(data.outbox, { retentionDays })` — or `runOutboxRelay`, which calls it for you | 7 days after processing | Only processed and dead-lettered events are removed. See [Outbox Relay (Cron)](./outbox-cron). |
| `sessions`, `refresh_tokens`, `login_sessions` | `data.sessionCleanup?.({ tenant_id? })` | 1 week past expiry (fixed grace period) | Optional adapter method. Can be scoped to a single tenant. |
| `logs` | Not swept by AuthHero | — | Prune on `date` yourself, on whatever window your audit obligations require. |

Codes and outbox events are swept globally; they are not tenant-scoped, because an expired row is dead regardless of who owns it.

## A complete scheduled handler

```ts
import { cleanupCodes, runOutboxRelay } from "authhero";

export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    // Outbox: drains pending events, then cleans up processed ones.
    await runOutboxRelay({
      dataAdapter,
      issuer: env.ISSUER,
      webhookInvoker,
      codeExecutor,
      retentionDays: 7,
    });

    // Codes: nothing else prunes these.
    await cleanupCodes(dataAdapter.codes, { retentionDays: 1 });

    // Sessions, refresh tokens and login sessions.
    await dataAdapter.sessionCleanup?.();
  },
};
```

Daily is a reasonable cadence for all three.

## Why `codes` has a grace period

`codes` rows are dead the moment they pass `expires_at`, so the default one-day window is not a retention policy so much as a safety margin against clock skew — and it keeps a recently expired code around long enough to debug a failed login. Setting `retentionDays: 0` is valid and sweeps everything already expired.

## Adapter behaviour

- **Drizzle** sweeps `codes` using the indexed ISO-8601 `expires_at` column directly.
- **Kysely** sweeps using `expires_at_ts`, a numeric twin of `expires_at` added by the `2026-07-16T12:00:00_codes_expires_at_ts` migration. That migration also prunes whatever had already accumulated, so the first deploy after upgrading clears the backlog.
- **DynamoDB (AWS)** needs no sweep: codes carry a native `ttl` attribute and DynamoDB expires them itself. `cleanup()` is a no-op returning `0`, so the handler above is safe to run unchanged.

## If you are upgrading an existing deployment

The kysely migration prunes expired codes before it adds the index, so it stays cheap even on a table that has grown to millions of rows. It logs what it removed. Once it has run, the scheduled `cleanupCodes` call is what stops the table growing again — the migration is a one-time catch-up, not a substitute for the cron.
