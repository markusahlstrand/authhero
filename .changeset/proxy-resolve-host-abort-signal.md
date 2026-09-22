---
"@authhero/proxy": minor
---

`ProxyDataAdapter.resolveHost` and `HostResolverCache.resolveHost` take an optional `{ signal }`. The router's `resolveHostTimeoutMs` ceiling and the cache layers' `upstreamTimeoutMs` deadlines now abort that signal instead of only racing the call, so the HTTP adapter's control-plane fetch stops when a deadline fires. Background stale-while-revalidate refreshes are not tied to the caller's signal. Adapters that ignore the signal (KV, static) keep the race as the fallback; existing implementations compile unchanged.
