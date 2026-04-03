---
title: Audit Events
description: Architecture of the transactional outbox pattern for atomic audit logging and event streaming.
---

# Audit Events Architecture

AuthHero uses the **transactional outbox pattern** to guarantee that audit events are captured atomically with entity mutations. This page covers the design decisions and trade-offs.

## Why an Outbox?

Direct audit logging has two problems:

1. **Non-atomic writes.** The entity mutation and the log write are separate operations. A crash between them loses the audit record silently.
2. **Non-transactional destinations.** Some destinations (Analytics Engine, R2, webhooks) can never participate in a database transaction.

The outbox separates **capture** from **delivery**: the audit event is written to the database atomically with the entity mutation, then delivered asynchronously to each destination.

## Transaction Boundary

When the outbox is enabled, each mutating management API request is wrapped in a single database transaction:

```
┌─────────────────────────────────────────────┐
│  DB Transaction (request-scoped)            │
│                                             │
│  1. Entity read (before state)              │
│  2. Entity write (UPDATE/INSERT/DELETE)     │
│  3. Outbox write (INSERT outbox_events)     │
│                                             │
│  COMMIT or ROLLBACK                         │
└─────────────────────────────────────────────┘
```

If the route handler throws (HTTP 404, 409, 500), the transaction rolls back — neither the entity mutation nor the outbox event is persisted.

## Relay Processing

After the transaction commits, a background relay (via `waitUntil`) processes undelivered events:

1. Fetch unprocessed events ordered by `created_at`
2. For each event, transform and deliver to each destination
3. Mark successful events as processed
4. Retry failed events with exponential backoff (1s, 2s, 4s, ... up to 5 min)
5. Clean up processed events past the retention period

The relay provides **at-least-once delivery** — destinations should be idempotent.

## Sensitive Field Redaction

Before/after entity state is automatically redacted for sensitive fields: `password`, `password_hash`, `client_secret`, `signing_keys`, `credentials`, `encryption_key`, `otp_secret`. These appear as `[REDACTED]` in the audit event.

## Database Considerations

### SQLite (local development)

Native transaction support via WAL mode. No special considerations.

### PlanetScale / MySQL (production)

When `useTransactions` is `false` in the database adapter options, the `transaction()` method is a passthrough — the outbox write is best-effort (non-atomic). This is a documented trade-off for PlanetScale deployments that don't support traditional transactions.

## Cleanup and Retention

Processed events are deleted after a configurable retention period (default: 7 days). Cleanup runs automatically as part of each relay execution — no separate cron job needed.

## Related

- [Feature: Audit Logging](/features/audit-logging) — configuration and usage guide
- [Outbox Adapter](/customization/adapter-interfaces/outbox) — adapter interface reference
- [Adapters](/architecture/adapters) — overview of the adapter pattern
