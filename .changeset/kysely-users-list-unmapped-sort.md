---
"@authhero/kysely-adapter": patch
---

Ignore an unmapped `sort_by` in `users.list()` instead of passing it through to SQL. A request like `sort=id:1` (where `id` isn't a users column) produced an unqualified `order by id`, which MySQL/Vitess rejects with "Unknown column 'id' in 'order clause'" once `user_activity` is joined. Unknown sort fields are now dropped, matching the drizzle adapter.
