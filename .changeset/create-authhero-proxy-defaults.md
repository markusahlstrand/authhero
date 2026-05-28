---
"create-authhero": minor
---

The local template's `migrate` step now creates the `proxy_routes` table as part of the standard `@authhero/kysely-adapter` migrations, and the generated server exposes `/api/v2/proxy-routes` for managing proxy routes per tenant. The proxy template README gains documented database-backed (via `@authhero/kysely-adapter`) and HTTP-backed adapter configurations alongside the static default.
