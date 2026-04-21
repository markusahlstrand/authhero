---
title: Outbox Adapter
description: Interface reference for the transactional outbox adapter and custom event destinations.
---

# Outbox Adapter

The `OutboxAdapter` is an optional adapter on `DataAdapters` that stores audit events for reliable, asynchronous delivery. It is implemented by the Kysely adapter and can be implemented by custom adapters.

## OutboxAdapter Interface

```typescript
interface OutboxAdapter {
  /** Write an audit event to the outbox */
  create(tenantId: string, event: AuditEventInsert): Promise<void>;

  /** Fetch unprocessed events ready for delivery */
  getUnprocessed(limit: number): Promise<OutboxEvent[]>;

  /** Atomically claim events for exclusive processing. Returns IDs that were successfully claimed. */
  claimEvents(ids: string[], workerId: string, leaseMs: number): Promise<string[]>;

  /** Mark events as successfully processed */
  markProcessed(ids: string[]): Promise<void>;

  /** Mark an event for retry with a backoff delay */
  markRetry(id: string, error: string, nextRetryAt: string): Promise<void>;

  /** Delete processed events older than the given ISO date */
  cleanup(olderThan: string): Promise<number>;
}
```

## AuditEvent Type

The `AuditEventInsert` schema captures the full context of a mutation:

```typescript
interface AuditEventInsert {
  tenant_id: string;
  event_type: string;        // e.g. 'user.updated'
  log_type: LogType;         // Auth0-compatible code
  description?: string;
  category: 'user_action' | 'admin_action' | 'system' | 'api';

  actor: {
    type: 'user' | 'admin' | 'system' | 'api_key' | 'client_credentials';
    id?: string;
    email?: string;
    org_id?: string;
    scopes?: string[];
    client_id?: string;
  };

  target: {
    type: string;             // 'user', 'client', 'role', etc.
    id: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    diff?: Record<string, { old: unknown; new: unknown }>;
  };

  request: {
    method: string;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    ip: string;
    user_agent?: string;
  };

  response?: { status_code: number; body?: unknown };
  hostname: string;
  timestamp: string;
}
```

## Custom Event Destinations

The relay delivers events to destinations via the `EventDestination` interface:

```typescript
interface EventDestination {
  name: string;
  transform(event: AuditEvent): unknown;
  deliver(events: unknown[]): Promise<void>;
}
```

### Built-in: LogsDestination

Transforms `AuditEvent` into `LogInsert` and writes to the logs table, preserving backward compatibility with `GET /api/v2/logs`.

### Writing a Custom Destination

```typescript
import { AuditEvent } from "@authhero/adapter-interfaces";
import { EventDestination } from "authhero/helpers/outbox-relay";

class WebhookDestination implements EventDestination {
  name = "webhook";

  constructor(private webhookUrl: string) {}

  transform(event: AuditEvent) {
    return {
      event_type: event.event_type,
      tenant_id: event.tenant_id,
      actor: event.actor,
      target: event.target,
      timestamp: event.timestamp,
    };
  }

  async deliver(events: unknown[]) {
    await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
  }
}
```

## Database Schema

The `outbox_events` table stores events with denormalized index columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | nanoid |
| `tenant_id` | TEXT | Tenant scope |
| `event_type` | TEXT | e.g. `user.updated` |
| `log_type` | TEXT | Auth0 log type code |
| `aggregate_type` | TEXT | Entity type |
| `aggregate_id` | TEXT | Entity ID |
| `payload` | TEXT | Full AuditEvent as JSON |
| `created_at` | TEXT | ISO timestamp |
| `processed_at` | TEXT | null until processed |
| `retry_count` | INTEGER | Delivery attempts |
| `next_retry_at` | TEXT | Backoff timestamp |
| `error` | TEXT | Last error message |
| `claimed_by` | TEXT | Worker ID holding the lease |
| `claim_expires_at` | TEXT | When the lease expires |

## Related

- [Outbox Relay (Cron)](/deployment/outbox-cron) — wiring `runOutboxRelay` from a scheduled handler
- [Feature: Audit Logging](/features/audit-logging) — configuration guide
- [Architecture: Audit Events](/architecture/audit-events) — design rationale
