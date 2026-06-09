---
"@authhero/adapter-interfaces": minor
"authhero": patch
---

Tighten PATCH `/api/v2/custom-domains/{id}` to match Auth0: only `tls_policy`, `custom_client_ip_header`, and `domain_metadata` (the authhero extension) are accepted. Previously the route accepted a partial of the full schema, which made round-trips (GET → modify → PATCH) fail with `Payload validation error` once clients sent immutable fields like `custom_domain_id`, `domain`, `primary`, `status`, `type`, etc. Adds an exported `customDomainUpdateSchema` for clients to bind to.
