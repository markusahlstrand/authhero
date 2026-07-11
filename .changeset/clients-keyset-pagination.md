---
"authhero": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
---

`GET /clients` now supports true keyset (checkpoint) pagination with an opaque `next` cursor.

Auth0 documents `/clients` as a checkpoint endpoint, but our implementation treated `from` as a numeric SQL offset and never returned `next`. The kysely and drizzle adapters now branch to the shared keyset paginator (created_at desc, client_id tiebreaker) when `from`/`take` is present, and the endpoint returns `{ clients, next }` in that mode. Offset pagination (`page`/`per_page` + `total`), used by the admin UI, is unchanged.

The drizzle adapter's list response is also aligned with the adapter contract: totals are now returned as a nested `totals` object (previously flattened and dropped by the management API), `length` reflects the returned page rather than the total count, and the `include_totals` count now honors the `q` filter.
