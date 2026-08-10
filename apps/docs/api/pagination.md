---
title: Pagination
description: Offset and checkpoint (cursor) pagination on the AuthHero Management API.
---

# Pagination

Management API list endpoints support two pagination modes, mirroring Auth0:

- **Offset pagination** — `page` / `per_page` (+ optional `include_totals`). Works everywhere, but pages can shift when rows are inserted mid-walk, and computing totals gets expensive on large tables.
- **Checkpoint pagination** — `from` / `take` with an opaque `next` cursor. Stable under concurrent writes and cheap at any depth. Preferred for exports and full-table walks.

## Offset pagination

```http
GET /api/v2/users?page=0&per_page=50&include_totals=true
```

- `page` defaults to `0`, `per_page` to `50`.
- Without `include_totals=true` the response is a bare array; with it you get the Auth0 totals envelope (`start`, `limit`, `length`, `total` plus the items array).

## Checkpoint pagination

```http
GET /api/v2/users?take=50
```

```json
{
  "users": [ ... ],
  "next": "eyJpIjoiZW1haWx8..."
}
```

Pass `next` back verbatim as `from` to continue:

```http
GET /api/v2/users?take=50&from=eyJpIjoiZW1haWx8...
```

- `take` defaults to 50 when omitted.
- `next` is an **opaque cursor** — do not parse or construct it. It is absent on the last page, which is the termination signal.
- The response is a plain `{ <items>, next? }` envelope; `include_totals` is ignored in checkpoint mode — no `total` is computed.

### Supported endpoints

| Endpoint | Items field |
| -------- | ----------- |
| `GET /api/v2/users` | `users` |
| `GET /api/v2/logs` | `logs` |
| `GET /api/v2/clients` | `clients` |
| `GET /api/v2/client-grants` | `client_grants` |
| `GET /api/v2/organizations` | `organizations` |
| `GET /api/v2/organizations/{id}/members` | `members` |
| `GET /api/v2/roles/{id}/users` | `users` |

Other list endpoints accept `from`/`take` in their query schema but ignore them and never return `next` — they stay offset-paginated.

### Mode selection and sorting

- Supplying **either** `from` or `take` switches the whole request to checkpoint mode; `page` and `per_page` are then ignored.
- Checkpoint walks are ordered by creation time descending (users/logs also accept ascending). On `/users` only `sort=created_at:1|-1` is honored and on `/logs` only `sort=date:1|-1`; any other sort column returns `400`. The remaining endpoints use a fixed order and ignore `sort`.
- A cursor is bound to the sort it was minted under — replaying it with a different `sort` returns `400`.
- `GET /roles/{id}/users` caps `take` (and `per_page`) at 100, matching Auth0.

### Differences from Auth0

- Auth0 does **not** offer checkpoint pagination on `GET /users` (offset only, capped at 1000 results); AuthHero does, so full user exports don't need `q` partitioning tricks.
- Auth0 documents `from` as an id; AuthHero keeps it fully opaque so the encoding can evolve.
- Checkpoint walks on `/users` return primary users only — linked accounts appear as `identities` on their primary user rather than as separate rows.

### Adapter note

The DynamoDB (`@authhero/aws`) adapter does not implement true checkpoint cursors yet — it treats `from` as a numeric offset and never returns `next`. Use the Drizzle or Kysely adapters for cursor-stable walks.
