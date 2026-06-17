---
"authhero": minor
---

Add an `additionalIssuers` resolver to the auth config, mirroring
`additionalManagementAudiences`. When verifying bearer JWTs, the management API
now accepts any `iss` returned by the resolver in addition to the deployment's
own `getIssuer(env, custom_domain)`. The resolver receives the token's
`tenant_id` and returns the extra issuers accepted for that token (returning
`[]` keeps the strict single-issuer behavior).

This unblocks workers-for-platforms setups where a control-plane-minted admin
token (`iss` = control-plane issuer) is forwarded to a per-tenant worker whose
`env.ISSUER` is per-tenant: the signature still verifies, and the issuer check
no longer rejects it. authhero never derives or hardcodes any issuer — scoping
is the host app's responsibility. Default behavior is unchanged for anyone not
setting `additionalIssuers`. The new `IssuerResolver` type is exported.
