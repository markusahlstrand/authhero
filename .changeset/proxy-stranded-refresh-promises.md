---
"@authhero/proxy": patch
---

Stop a stranded host resolve from wedging a Worker isolate. Both cache layers and the HTTP control-plane adapter kept the pending refresh at isolate scope so concurrent callers could share it. On Workers that promise belongs to the request that started it: when that request ends the promise may settle neither way, and every later caller awaiting it hung — permanently, since nothing but the promise settling cleared the pointer, and in `createInMemoryHostCache` an entry with a refresh attached was also skipped by eviction. A single cancelled request could therefore turn one host into a guaranteed 504 for the life of the isolate.

Each caller now runs its own upstream call. Background refreshes during the stale window are still damped, by a timestamp rather than a promise, so nothing can strand. Both cache layers also take an `upstreamTimeoutMs` deadline (8000 ms in-memory, 5000 ms in the `CacheAdapter` layer, `0` to disable) so `staleIfErrorTtlMs` is actually reachable when an upstream stops answering, and the HTTP adapter's timeout now covers the response body rather than only the headers.
