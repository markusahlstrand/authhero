---
"@authhero/multi-tenancy": patch
"authhero": patch
---

Stop merging control-plane client URLs into `clients.get`/`getByClientId` at the adapter layer. The merge previously surfaced inherited `callbacks`, `web_origins`, `allowed_logout_urls`, and `allowed_origins` everywhere the adapter was read — including the management API, which caused the admin UI to display (and on save, persist) URLs that actually belonged to the control-plane client. The URL merge now happens in authhero's `getEnrichedClient` helper, which only auth-flow code paths use; storage reads from the management API and DCR see the tenant's raw stored values.

The `mergeClientWithFallback` helper is now exported from `@authhero/multi-tenancy` so external runtimes can apply the merge themselves if they bypass `getEnrichedClient`.
