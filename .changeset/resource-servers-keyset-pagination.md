---
"authhero": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Support keyset (checkpoint) pagination on `GET /api/v2/resource-servers`. Passing `from`/`take` now returns `{ resource_servers, next }` with an opaque cursor, in fixed `created_at desc` order with an id tiebreaker. The existing `page`/`per_page` + `include_totals` offset mode is unchanged.
