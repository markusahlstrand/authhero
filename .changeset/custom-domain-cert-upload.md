---
"@authhero/adapter-interfaces": minor
"@authhero/cloudflare-adapter": minor
"authhero": minor
---

Add custom domain certificate upload (PEM) for adapters that can terminate TLS at the edge.

- `@authhero/adapter-interfaces`: new `customDomainCertificateUploadSchema` (`{ certificate, private_key }` PEM-validated) and an optional `uploadCertificate(tenant_id, id, cert)` method on `CustomDomainsAdapter`.
- `@authhero/cloudflare-adapter`: implements `uploadCertificate`, forwarding `custom_certificate` and `custom_key` to Cloudflare's Custom Hostnames API (BYOC). Cert and key are not persisted by authhero.
- `authhero`: new `PUT /custom-domains/{id}/certificate` management-api route, scoped to `update:custom_domains`. Returns 501 if the configured adapter doesn't implement `uploadCertificate`.

This is an authhero extension beyond Auth0's API surface — Auth0's `self_managed_certs` mode requires customers to run their own reverse proxy. Here we let the Cloudflare edge terminate TLS with a customer-supplied cert.
