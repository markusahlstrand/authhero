---
"authhero": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/adapter-interfaces": minor
---

feat(pagination): checkpoint (from/take + opaque next cursor) on GET /users, and align the default page size with Auth0 (#1098)

- `GET /users` now supports keyset (checkpoint) pagination via `from`/`take`, returning `{ users, next }` with an opaque cursor that is absent on the last page. This is a deliberate superset of Auth0, which only offers offset paging on /users and caps it at 1000 results — full-tenant walks no longer need export jobs. Offset paging (`page`/`per_page` + totals) is unchanged.
- In checkpoint mode, `q` filters stay in effect and `created_at` asc/desc is sortable (`user_id` is the unique tiebreaker). The cursor records the sort it was minted under; replaying it with a different sort returns 400. Unsupported sort columns return 400.
- Linked accounts remain folded into their primary user's `identities` during cursor walks and never appear as top-level rows.
- The default page size for offset pagination is now 50 (was 10), matching Auth0's documented default. Requests that pass an explicit `per_page` are unaffected.
- kysely: the shared keyset helper now accepts table-qualified sort/id columns for queries with joins.
