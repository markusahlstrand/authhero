---
"create-authhero": minor
---

Add `--template proxy` to scaffold a Cloudflare Workers reverse proxy built on `@authhero/proxy`. The generated project ships a `src/proxy.config.ts` (edited statically by the user), a Worker entry that wires `createStaticProxyAdapter` + `createProxyApp` with a 5-minute fresh / 1-hour stale SWR cache, and AsyncLocalStorage glue so background refreshes use `ctx.waitUntil`. No database, no migrations.
