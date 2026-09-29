---
"authhero": minor
"@authhero/adapter-interfaces": minor
---

Add an optional `signingCertificateAuthority` to `init()`. When it's set, new and renewed `jwt_signing` certificates are issued from your intermediate CA instead of being self-signed. Each certificate carries a SAN URI naming its owner: `urn:authhero:tenant:<id>` for tenant keys and `urn:authhero:control-plane` for shared keys. The JWKS publishes `x5c` and `x5t#S256` for these keys, so a resource server can pin one root instead of keeping an issuer registry. `createLocalCertificateIssuer` provides an in-process issuer, and `ensureSigningKey` accepts a `certificateAuthority` option. The JWKS schema now allows `x5t#S256`. Without the option, nothing changes.
