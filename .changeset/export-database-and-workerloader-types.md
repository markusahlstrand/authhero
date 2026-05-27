---
"@authhero/kysely-adapter": patch
"@authhero/cloudflare-adapter": patch
---

Export `Database` type from `@authhero/kysely-adapter` and `WorkerLoader` (plus `WorkerCode`, `WorkerStub`, `WorkerLoaderCodeExecutorOptions`) from `@authhero/cloudflare-adapter`. These were reachable as parameter types but missing from the public `.d.ts` export list, forcing consumers to recover them via `Parameters<typeof ...>`.
