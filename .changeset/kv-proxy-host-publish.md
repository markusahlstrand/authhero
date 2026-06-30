---
"@authhero/proxy": minor
"authhero": minor
---

Add Cloudflare KV as a published read replica for proxy host resolution.

`@authhero/proxy` gains `createKvProxyAdapter`, a `ProxyDataAdapter` that
resolves a `Host` to its `ResolvedHost` blob with a single, unauthenticated,
edge-local `KV.get` — a faster, more reliable alternative to the two-hop
HTTP control-plane adapter. It slots into the existing `upstream` seam of
`createCacheAdapterHostCache`, with `createHttpProxyAdapter` left as the
miss / `stale-if-error` fallback during cutover. The KV binding is passed as
a minimal structural interface, so the package keeps its zero-Cloudflare
footprint. Also exports `buildKvHostKey` and `DEFAULT_KV_HOST_KEY_PREFIX`.

`authhero` gains the control-plane publisher `wrapProxyAdaptersWithKvPublish`,
which wraps the `customDomains` + `proxyRoutes` adapters so every write
recomputes the affected host's full blob and publishes it to KV
fire-and-forget (via `waitUntil`). Wrapping at the adapter layer makes it the
single choke-point — pass the wrapped pair to both the management-api app
(direct writes) and `createApplySyncEvents` (WFP `/sync`-applied writes) so KV
stays in sync regardless of write origin. `backfillProxyHostsToKv` covers the
one-time migration backfill and doubles as the periodic reconcile primitive.
