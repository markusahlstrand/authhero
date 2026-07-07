---
"@authhero/drizzle": patch
---

Fix data.transaction() throwing on Cloudflare D1. The generic transaction wrapper (and actionVersions.create) issued raw BEGIN/COMMIT/ROLLBACK, which D1 rejects, so every flow wrapping writes in data.transaction() (user create, link-users, register, logout, ...) failed with a 500. The wrapper now feature-detects batch-capable drivers the same way runAtomic does: on D1 the callback runs directly (non-atomic, same as useTransactions: false) while per-adapter multi-statement writes stay atomic via db.batch(); better-sqlite3 keeps interactive transactions. actionVersions.create now routes its deployed-clear + insert through runAtomic.
