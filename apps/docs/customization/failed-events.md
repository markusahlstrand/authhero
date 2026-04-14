---
title: Failed Events (Dead-letter Queue)
description: Management API endpoints for listing and replaying outbox events whose delivery exhausted retries.
---

# Failed Events

When an outbox event exceeds its retry budget (default 5 attempts, exponential backoff capped at 5 minutes), the relay moves it to **dead-letter** state rather than silently dropping it. The event stays in `outbox_events` with:

- `processed_at` set (so the relay stops considering it)
- `dead_lettered_at` set to the time of the move
- `final_error` set to the last failure reason
- All previous columns (`retry_count`, `error`, `payload`, …) preserved for forensics

The management API exposes two endpoints for operators to inspect and replay dead-lettered events.

## `GET /api/v2/failed-events`

Lists dead-lettered events for the authenticated tenant, newest first.

### Request

```http
GET /api/v2/failed-events?page=0&per_page=50&include_totals=true
Authorization: Bearer <management-api-token>
tenant-id: <tenant-id>
```

### Query parameters

| Param            | Type    | Default | Description                                          |
| ---------------- | ------- | ------- | ---------------------------------------------------- |
| `page`           | number  | `0`     | Zero-based page index.                               |
| `per_page`       | number  | `50`    | Page size.                                           |
| `include_totals` | boolean | `false` | When `true`, the response includes `length`.         |

### Response

```json
{
  "events": [
    {
      "id": "01HY…",
      "tenant_id": "tenantId",
      "event_type": "hook.post-user-registration",
      "log_type": "sapi",
      "retry_count": 5,
      "error": "webhooks: Webhook h1 (post-user-registration) returned 500: …",
      "dead_lettered_at": "2026-04-14T11:02:00.000Z",
      "final_error": "webhooks: Webhook h1 (post-user-registration) returned 500: …",
      "target": { "type": "user", "id": "auth2|abc" },
      "request": { "method": "POST", "path": "/users", "ip": "1.2.3.4" },
      "...": "full AuditEvent shape"
    }
  ],
  "start": 0,
  "limit": 50,
  "length": 1
}
```

The event payload is the full `AuditEvent` — `event_type` tells you the trigger (`hook.post-user-registration`, `hook.post-user-deletion`, `log.…`), and `target.id` the affected user.

## `POST /api/v2/failed-events/:id/retry`

Resets a dead-lettered event so the next relay pass picks it up again.

### Request

```http
POST /api/v2/failed-events/01HY…/retry
Authorization: Bearer <management-api-token>
tenant-id: <tenant-id>
```

### Response

```json
{ "id": "01HY…", "replayed": true }
```

### Errors

- `404 Not Found` — no dead-lettered event exists with that id in this tenant.
- `501 Not Implemented` — the current tenant's `DataAdapters` has no `outbox` (e.g. the AWS DynamoDB adapter).

### What `replay` actually does

Under the hood, `OutboxAdapter.replay(id)` clears:

- `processed_at` → `null`
- `dead_lettered_at` → `null`
- `final_error` → `null`
- `retry_count` → `0`
- `next_retry_at` → `null`
- `error` → `null`

It does **not** touch `claimed_by` / `claim_expires_at`, because those expire naturally and the next `claimEvents` call will overwrite them.

After replay, the event behaves identically to a freshly-enqueued one. Destinations must still be idempotent — the payload and `id` are unchanged, so webhooks with `Idempotency-Key` will dedupe correctly on the receiving side.

## Operating the queue

- **Alerting**. The relay calls `console.warn(...)` on dead-letter. Wire that to your log aggregation for noisy-neighbor visibility, or poll `GET /failed-events` from an operator dashboard.
- **Bulk replay**. Not yet exposed as a single endpoint — iterate the list and POST each id individually. See the [Roadmap](../roadmap.md) if this becomes painful.
- **Manual discard**. Not yet exposed — dead-lettered events age out via the `cleanup` retention sweep along with normally-processed events.
- **Auth scopes**. `GET` requires `read:logs` / `auth:read`. `POST` requires `update:logs` / `auth:write`. Both are tenant-scoped — dead-lettered events from other tenants are invisible.

## When to suspect the dead-letter queue

- A customer reports their webhook was never called for a recent signup.
- `registration_completed_at` stays null on a user after several logins (self-healing re-enqueues every login — if the destination is permanently broken, the event dead-letters again each time).
- A `console.warn` line from the relay mentions `exceeded max retries (5), dead-lettering`.

See also the [Hooks & Outbox Pipeline architecture doc](../architecture/hooks-pipeline.md) for how events reach this queue and what self-healing does with them.
