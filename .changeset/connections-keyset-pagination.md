---
"authhero": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Support keyset (checkpoint) pagination on `GET /api/v2/connections`. Passing `from`/`take` now returns `{ connections, next }` with an opaque cursor, in fixed `created_at desc` order with an id tiebreaker. The existing `page`/`per_page` + `include_totals` offset mode is unchanged.
