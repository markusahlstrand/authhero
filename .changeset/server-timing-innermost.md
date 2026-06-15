---
"authhero": patch
---

Server-Timing now reports only genuine backend round-trips, plus a separate, labelled line for cache-backend latency. The timing wrapper was the outermost data-adapter layer, so it logged every surface read — including cache, request-dedup, and client-bundle hits — and attributed the whole bundle's assembly cost to whichever read happened to trigger it (e.g. a single `clients-get` showed up three times, two of them cache-served). It now sits innermost (below caching/dedup/bundle), so the header carries one entry per real DB call with its true duration, and reads served from cache produce no data-adapter entry.

The cache backend itself is now timed separately and emitted as `cache-get:<prefix>` / `cache-set:<prefix>` (e.g. `cache-get:client-bundle`, `cache-get:customText`), where the prefix is the cache-key namespace — never the full, id-bearing key. On Workers this surfaces the Cache API round-trip latency that the data-adapter timing could not see. Applies to the auth-api, universal-login, SAML, and management-api routers.
