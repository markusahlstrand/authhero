---
"authhero": patch
---

Security: bind the control-plane `isTrustedIssuer` predicate to the token's
`tenant_id` claim.

`verifyControlPlaneToken` accepted WFP tenant-subdomain issuers via
`isTrustedIssuer` but never bound the tenant encoded in `iss` (the key owner)
to the `tenant_id` claim it returned. With per-tenant signing keys, a caller
holding tenant A's key could set `tenant_id: "B"` and act on tenant B — a
cross-tenant escalation on the subdomain-issuer path (#1143).

The predicate now receives the (unverified) `tenant_id` claim as a second
argument — `isTrustedIssuer?: (iss, tenantId) => boolean` — so deployments can
bind key-owner to claimed-tenant atomically, e.g.
`(iss, tid) => !!tid && iss === \`https://${tid}.${issuerHost}/\``. The binding
is confirmed by the signature check the verifier runs immediately afterwards.

This is a signature change to the `isTrustedIssuer` hook shipped in 8.25.0.
There are no consumers of the hook yet, so it lands without a deprecation
window; this must be in place before any deployment enables subdomain issuers.
