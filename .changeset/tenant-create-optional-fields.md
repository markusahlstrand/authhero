---
"@authhero/adapter-interfaces": patch
"authhero": patch
---

Loosen `audience`, `sender_email`, and `sender_name` to optional on `tenantInsertSchema` and `CreateTenantParams`. The admin UI tenant-create form now only asks for `id` and `friendly_name` plus the deployment fields; the omitted fields can be set later via tenant settings. Matches Auth0's model where tenant-level audience isn't required (per-token `aud` comes from resource servers / client grants). The legacy service-token path still errors clearly if it's asked to mint a token for a tenant without an `audience`.
