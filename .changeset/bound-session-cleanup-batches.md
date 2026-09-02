---
"@authhero/kysely-adapter": patch
---

Bound and fairly schedule the session cleanup sweep. `createSessionCleanup` drained `refresh_tokens`, `sessions` and `login_sessions` one after another with unbounded loops, so on Cloudflare Workers a backlog in an earlier table could consume the whole subrequest budget and leave `login_sessions` unswept indefinitely. The three tables are now swept round-robin under a per-invocation budget of 300 batches, and an exhausted budget logs a `console.warn` naming the tables that did not drain instead of a success-shaped line.
