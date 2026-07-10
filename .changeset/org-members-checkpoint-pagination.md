---
"@authhero/adapter-interfaces": minor
"authhero": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
---

Add Auth0-style keyset (checkpoint) pagination with an opaque `next` cursor.

List endpoints previously treated the `from` parameter as a numeric SQL offset, which diverges from Auth0 (where `from` is the opaque `next` token from the prior response) and is unstable under concurrent writes. Organization and organization-members listing now support true keyset pagination:

- `adapter-interfaces` exposes `encodeCursor`/`decodeCursor` and a `next` field on the list-response contract. `from` is documented as an opaque cursor.
- kysely and drizzle gain a shared keyset paginator (`(sortColumn, id)` row-value comparison, `take + 1` look-ahead to emit `next`). Offset pagination (`page`/`per_page` + `total`), used by the admin UI, is unchanged.
- `GET /organizations` and `GET /organizations/{id}/members` return `{ items, next }` when called with `from`/`take`, and keep the offset shape for `page`/`per_page`.

This fixes `GET /organizations/{id}/members` being capped at 10 (the Auth0 SDK sends `from`/`take`) and lets clients page the full set via the cursor. The admin UI's org-members view switches to offset pagination so it keeps numbered pages and totals.
