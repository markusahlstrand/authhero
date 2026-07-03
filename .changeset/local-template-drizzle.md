---
"create-authhero": minor
---

Switch the local (SQLite) template from the kysely adapter to @authhero/drizzle, aligning it with the Cloudflare/D1 templates. The scaffolded project now uses drizzle-orm/better-sqlite3 with the pre-generated migrations shipped in @authhero/drizzle. Existing scaffolded projects keep working; to adopt drizzle in an existing local project, delete db.sqlite and re-run migrate + seed (the kysely and drizzle migration histories are not compatible).
