---
"authhero": minor
---

Fix per-tenant JWT verification on tenants that run their own signing keys.

Bearer-token verification previously used a single, host-blind JWKS source
(`JWKS_URL` + `JWKS_SERVICE` if set, otherwise an un-tenant-filtered DB
query). On a deployment where the cloud bindings pointed `JWKS_URL` at the
control-plane host's `/.well-known/jwks.json`, tokens minted by a tenant
with its own signing keys failed with `"no matching kid found"` even
though the kid was published at that tenant's JWKS endpoint.

`validateJwtToken` now resolves the JWKS from the request's tenant
context (`ctx.var.tenant_id`) via `getJwksForVerification`, mirroring
`getJwksForPublication` — so any kid that appears in a tenant's published
JWKS will also verify. When no tenant is resolved (control-plane host
with no tenant subdomain), only control-plane-signed tokens are
accepted.

Verification also now requires `payload.iss` to equal
`getIssuer(env, ctx.var.custom_domain)`. A token signed by tenant A can
no longer authenticate on tenant B's host even if both keysets share a
kid during a key rollout.

The `JWKS_URL` and `JWKS_SERVICE` bindings have been removed from
`Bindings`. Deployments that need a tenant's JWKS over HTTP should fetch
the tenant's `/.well-known/jwks.json` endpoint directly.
