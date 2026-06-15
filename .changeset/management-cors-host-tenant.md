---
"authhero": patch
---

Management API CORS preflight now resolves the tenant from the request host
(tenant subdomain of the ISSUER apex, or a custom domain) in addition to the
`tenant-id` header. Browsers never send custom headers on a preflight, so
host-addressed management calls (the admin console using `{tenant}.{apiHost}`
instead of the `tenant-id` header) can now pass per-tenant `web_origins` CORS
checks. The `tenant-id` header path is unchanged.
