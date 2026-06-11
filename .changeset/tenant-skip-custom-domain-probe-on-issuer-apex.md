---
"authhero": patch
---

Skip the `customDomains.getByDomain` lookup in the tenant middleware when the request host is the ISSUER host or a subdomain of it. Hosts on the canonical apex are tenant subdomains by construction, so the probe was always a no-op DB round-trip on every authorize/token/etc. request.
