---
"@authhero/drizzle": patch
---

Chunk the `role_permissions` bulk insert (18 rows per statement). D1 caps bound
parameters at 100 per query; assigning the admin role's 239 permissions in one
multi-VALUES insert exceeded it and failed on D1 while passing on
better-sqlite3. Chunking keeps one behavior across both drivers.
