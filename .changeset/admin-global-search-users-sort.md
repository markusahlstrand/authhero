---
"@authhero/admin": patch
---

Fix global search crashing user lookups. The search box issued every resource query with a hardcoded `sort: { field: "id" }`, but the `users` resource has no `id` column (only `user_id`), so a search emitted `sort=id:1` and the users endpoint failed with "Unknown column 'id' in 'order clause'". Sort field is now per-resource, defaulting to `id` and using `user_id` for users.
