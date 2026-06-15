---
"@authhero/admin": minor
---

Admin UI can now address tenant-scoped management API calls via per-tenant
subdomains (`{tenant_id}.{apiHost}`) instead of the `tenant-id` header. Enable
per domain in the domain selector ("Use tenant subdomains") or globally via the
`VITE_USE_TENANT_SUBDOMAINS=true` config. Control-plane calls (tenant
list/create) continue to use the apex host. The `tenant-id` header is still sent
alongside for backward compatibility, and loopback/IP hosts (local dev)
automatically fall back to the apex + header path.
