---
"@authhero/drizzle": patch
---

Make the Drizzle adapter's multi-statement writes atomic on D1. `sessions.create`, `refreshTokens.create`, `users.create` (with password) and `users.remove` previously wrapped their dependent writes in manual `BEGIN`/`COMMIT`/`ROLLBACK`, which is not atomic on D1's async driver and could leave partial writes on failure. These now go through a `runAtomic` helper that uses `db.batch()` (atomic on D1) when the driver supports it, and falls back to `BEGIN`/`COMMIT`/`ROLLBACK` on better-sqlite3 (used in tests).
