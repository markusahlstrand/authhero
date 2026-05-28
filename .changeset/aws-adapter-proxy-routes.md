---
"@authhero/aws-adapter": minor
---

Add `ProxyRoutesAdapter` implementation backed by DynamoDB (single-table design with a GSI for per-`custom_domain_id` queries). Surfaced as `createAdapters(client, config).proxyRoutes`. New `createProxyDataAdapter(ctx)` helper returns a full `ProxyDataAdapter` (CRUD + cross-tenant `resolveHost`) for the `@authhero/proxy` data plane reading from the same DynamoDB table.
