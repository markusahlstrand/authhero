---
title: Audit Logging
description: How AuthHero captures rich audit events for every management API mutation with optional transactional guarantees.
---

# Audit Logging

AuthHero captures audit events for every management API mutation — user creation, role assignment, client updates, and more. Events include the actor, the affected entity (with before/after state), the request context, and the response.

## Two Modes

### Default Mode (outbox disabled)

Audit events are written as `LogInsert` records to the logs table via `waitUntil`. This is fire-and-forget — if the application crashes between the entity write and the log write, the audit record is lost.

### Transactional Outbox Mode

When enabled, a rich `AuditEvent` is written to an `outbox_events` table alongside the entity mutation. A background relay then transforms and delivers events to destinations (logs table, and potentially Analytics Engine, R2, webhooks).

**With transactions enabled** (the default, `useTransactions: true` in the Kysely adapter), the outbox write and entity mutation share the same database transaction. This guarantees that if the entity write succeeds, the audit event is captured. If either fails, both are rolled back.

**With `useTransactions: false`** (passthrough mode), the outbox write is best-effort and not rollback-safe. The entity mutation and outbox insert are independent writes — if the entity write fails after the outbox write succeeds, the background relay may still deliver the audit event for a mutation that was never persisted.

## Configuration

```typescript
import { init } from "authhero";

const { app } = init({
  dataAdapter,
  outbox: {
    enabled: true,
    captureEntityState: true,  // capture before/after entity state (default: true)
    retentionDays: 7,          // days to keep processed events (default: 7)
    maxRetries: 5,             // max delivery retries per event (default: 5)
  },
});
```

When `outbox.enabled` is `false` (or omitted), behavior is identical to the default mode.

## The AuditEvent Type

Every audit event captures:

| Field | Description |
|-------|-------------|
| `event_type` | What happened — e.g. `user.updated`, `role.created` |
| `log_type` | Auth0-compatible log type code (e.g. `sapi`) |
| `category` | `user_action`, `admin_action`, `system`, or `api` |
| `actor` | Who performed the action — type, ID, email, scopes, client_id |
| `target` | What was affected — entity type, ID, before/after state, diff |
| `request` | HTTP method, path, query, body, IP, user agent |
| `response` | Status code and response body |
| `timestamp` | ISO 8601 timestamp |

### Before/After State

When `captureEntityState` is enabled, update operations capture the entity state before and after the mutation, plus a computed diff of changed fields. Sensitive fields (passwords, secrets) are automatically redacted.

## How Events Flow

```text
Request Handler
  │
  ├─ Entity write (e.g., UPDATE user)     ┐  Same DB transaction when
  └─ Outbox write (INSERT outbox_events)  ┘  useTransactions: true (default)
                    │
                    ▼  waitUntil (after response)
              Outbox Relay
                    │
                    ├─ LogsDestination: AuditEvent → LogInsert → logs table
                    ├─ (future) R2Destination: full event as NDJSON
                    └─ (future) WebhookDestination: filtered payload
```

## Querying Logs

The management API `GET /api/v2/logs` endpoints work identically in both modes. When the outbox is enabled, the relay populates the same logs table via the `LogsDestination` transformer.

## Scheduled Jobs

For the per-request path, the outbox relay runs via `waitUntil` after each response. For resilience (retries, workers that crashed mid-delivery), run `drainOutbox` on a schedule as well — it claims events with a lease so it's safe to run concurrently with the per-request relay.

`authhero` exposes three cron-style helpers you can wire into a Cloudflare Worker `scheduled()` handler or any cron runner:

| Helper | Purpose |
|--------|---------|
| `drainOutbox(outbox, destinations, options?)` | Sweep pending outbox events, deliver to destinations, handle retries / dead-letter. Also runs cleanup inline. |
| `cleanupOutbox(outbox, { retentionDays })` | Delete processed outbox events older than the retention window (default 7 days). Use when you want cleanup on a separate schedule from `drainOutbox`. |
| `cleanupSessions(data, { tenantId?, userId? })` | Delete expired `login_sessions`, `sessions`, and `refresh_tokens`. Unscoped by default. |

### Cloudflare Worker example

```typescript
import {
  drainOutbox,
  cleanupOutbox,
  cleanupSessions,
} from "authhero";

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await drainOutbox(env.data.outbox, destinations);
        await cleanupOutbox(env.data.outbox, { retentionDays: 7 });
        await cleanupSessions(env.data);
      })(),
    );
  },
};
```

Wire up a `wrangler.toml` cron trigger (e.g. `crons = ["* * * * *"]`) to invoke `scheduled()` every minute.

`drainOutbox` already calls cleanup inline each cycle, so `cleanupOutbox` is only needed if you want a different cadence, or want to run cleanup without processing.

## Related

- [Architecture: Audit Events](/architecture/audit-events) — deep dive into the outbox pattern
- [Outbox Adapter](/customization/adapter-interfaces/outbox) — adapter interface reference
