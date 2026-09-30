---
"@authhero/cloudflare-adapter": minor
---

`createWfpTenantApp` accepts a `signingCertificateAuthority` option (`{ issuer, tenantId }`). The tenant key minted in `sync-defaults`, rotations, renewals and the JWKS `x5c` all use it. Certificates always name the tenant, never the control plane. A new `POST /internal/renew-signing-certificates` route, protected by the sync secret, renews CA-issued certificates. `createDispatchRenewSigningCertificates` pushes that renewal to a tenant worker from the control plane's scheduled handler.
