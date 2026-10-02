---
title: Failed Events (Dead-letter Queue)
description: Management API endpoints for listing, replaying and discarding outbox events whose delivery exhausted retries.
---

# Failed Events

When an outbox event exceeds its retry budget (default 5 attempts, exponential backoff capped at 5 minutes), the relay moves it to **dead-letter** state rather than silently dropping it. The event stays in `outbox_events` with:

- `processed_at` set (so the relay stops considering it)
- `dead_lettered_at` set to the time of the move
- `final_error` set to the last failure reason
- All previous columns (`retry_count`, `error`, `payload`, …) preserved for forensics

The management API exposes endpoints for operators to inspect, replay and discard dead-lettered events.

## `GET /api/v2/failed-events`

Lists dead-lettered events for the authenticated tenant, newest first.

### Request

```http
GET /api/v2/failed-events?page=0&per_page=50&include_totals=true
Authorization: Bearer <management-api-token>
tenant-id: <tenant-id>
```

### Query parameters

| Param            | Type    | Default | Description                                  |
| ---------------- | ------- | ------- | -------------------------------------------- |
| `page`           | number  | `0`     | Zero-based page index.                       |
| `per_page`       | number  | `50`    | Page size.                                   |
| `include_totals` | boolean | `false` | When `true`, the response includes `length`. |

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

## `POST /api/v2/failed-events/bulk-retry`

Replays up to 100 dead-lettered events in one call — the usual shape of a
recovery after a destination was down for a while.

### Request

```http
POST /api/v2/failed-events/bulk-retry
Authorization: Bearer <management-api-token>
tenant-id: <tenant-id>
Content-Type: application/json

{ "ids": ["01HY…", "01HZ…"] }
```

### Response

```json
{
  "replayed": ["01HY…"],
  "not_found": ["01HZ…"]
}
```

The call reports per id instead of failing as a unit: an id that is unknown,
already replayed, or owned by another tenant lands in `not_found` while the
rest still replay. Repeated ids are deduplicated, so every id gets exactly one
verdict.

### Errors

- `400 Bad Request` — `ids` is empty or holds more than 100 entries. Page through a larger backlog.
- `501 Not Implemented` — the current tenant's `DataAdapters` has no `outbox`.

## `DELETE /api/v2/failed-events/:id`

Permanently deletes a dead-lettered event. Use it for an event that will never
succeed (for example, a webhook for a user that no longer exists) so it stops
cluttering the queue. **This cannot be undone** — the payload is gone, and the
event can no longer be replayed.

Only dead-lettered events can be discarded. A pending or already-delivered
event with the same id is left alone and the call answers `404`.

### Request

```http
DELETE /api/v2/failed-events/01HY…
Authorization: Bearer <management-api-token>
tenant-id: <tenant-id>
```

### Response

`204 No Content` with an empty body.

### Errors

- `404 Not Found` — no dead-lettered event exists with that id in this tenant.
- `501 Not Implemented` — the current tenant's `DataAdapters` has no `outbox`, or its outbox adapter does not implement the optional `discard` method.

## `POST /api/v2/failed-events/bulk-discard`

Permanently deletes up to 100 dead-lettered events in one call. Same rules as
the single-event `DELETE`: only dead-lettered events in this tenant are
removed, and the deletion cannot be undone.

### Request

```http
POST /api/v2/failed-events/bulk-discard
Authorization: Bearer <management-api-token>
tenant-id: <tenant-id>
Content-Type: application/json

{ "ids": ["01HY…", "01HZ…"] }
```

### Response

```json
{
  "discarded": ["01HY…"],
  "not_found": ["01HZ…"]
}
```

As with `bulk-retry`, each id gets its own verdict: an id that is unknown, not
dead-lettered, or owned by another tenant lands in `not_found` while the rest
are still discarded. Repeated ids are deduplicated.

### Errors

- `400 Bad Request` — `ids` is empty or holds more than 100 entries.
- `501 Not Implemented` — same as the single-event `DELETE`.

## Operating the queue

- **Alerting**. The relay calls `console.warn(...)` on dead-letter. Wire that to your log aggregation for noisy-neighbor visibility, or poll `GET /failed-events` from an operator dashboard.
- **Bulk replay**. Use `POST /failed-events/bulk-retry` with up to 100 ids per call.
- **Manual discard**. Use `DELETE /failed-events/:id` or `POST /failed-events/bulk-discard` to permanently drop events that will never succeed. Anything you don't discard ages out via the `cleanup` retention sweep along with normally-processed events. Discard relies on the optional `OutboxAdapter.discard` method, which the kysely and drizzle adapters implement; a custom adapter without it answers `501`.
- **Auth scopes**. `GET` requires `read:logs`. The retry and discard endpoints (`POST` and `DELETE`) require `update:logs`. All are tenant-scoped — dead-lettered events from other tenants are invisible.

## When to suspect the dead-letter queue

- A customer reports their webhook was never called for a recent signup.
- `registration_completed_at` stays null on a user after several logins (self-healing re-enqueues every login — if the destination is permanently broken, the event dead-letters again each time).
- A `console.warn` line from the relay mentions `exceeded max retries (5), dead-lettering`.

See also the [Hooks & Outbox Pipeline architecture doc](../architecture/hooks-pipeline.md) for how events reach this queue and what self-healing does with them.
