---
"create-authhero": minor
---

Add a `cloudflare-wfp-dispatcher` template that scaffolds a thin Cloudflare Worker for routing per-publisher custom domains to per-tenant authhero workers deployed in a Cloudflare Workers for Platforms dispatch namespace.

The dispatcher uses `@authhero/proxy`'s new `dispatch_namespace` handler to resolve incoming `Host` headers against the shared platform D1 (`custom_domains` table) and forward to `tenant-<id>-auth` scripts in the `authhero-tenants` namespace. Tenant workers are deployed separately via the existing `cloudflare` template using `wrangler deploy --dispatch-namespace=authhero-tenants --name=tenant-<id>-auth`.

Scaffold via `create-authhero --template=cloudflare-wfp-dispatcher`. See the generated `README.md` for the full onboarding workflow.
