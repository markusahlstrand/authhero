---
"@authhero/multi-tenancy": patch
---

Fix tenant deletion returning a 500 instead of the real status, and make tenant create/delete authorization symmetric.

- **Single Hono instance.** The build no longer inlines a second copy of Hono. The Rollup `external` config only matched the bare `hono` package, so the subpath import `hono/http-exception` was still bundled — giving the package its own `HTTPException` class. The host app's `instanceof HTTPException` check then failed and legitimate 401/403/404s surfaced as generic 500s. Subpath exports are now externalized too, so `hono` (and `@hono/zod-openapi`) resolve to the host app's single instance.
- **Super-admin delete path.** `DELETE /tenants/{id}` now lets a non-org-scoped control-plane token carrying the `delete:tenants` scope (or `admin:organizations`, mirroring the list route) delete any tenant without per-organization membership. Previously a tenant created via the API/UI by a global admin — who is deliberately not added to the tenant's organization by the provisioning hook — became undeletable through the API.
