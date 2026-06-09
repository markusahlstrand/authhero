---
"authhero": minor
---

Proxy control-plane now accepts bearer tokens whose `iss` is either the canonical `env.ISSUER` or the host the request actually arrived on (`x-forwarded-host`, falling back to the request URL host). This fixes 401s when the `@authhero/proxy` data plane calls the control plane on a tenant subdomain (e.g. `sesamy.token.sesamy.com`) or a registered custom domain (e.g. `login.parcferme.no`), where the minted token's `iss` matches the calling host rather than the canonical issuer.

JWKS is now fetched per-issuer from `<iss>/.well-known/jwks.json`, after the `iss` is allow-listed — this prevents a forged `iss` from steering the verifier to an attacker-controlled JWKS.

**Breaking config change** (`proxyControlPlane`): the `jwksUrl` option is removed. The JWKS URL is now derived from the verified `iss` per request. Callers that route JWKS fetches through a service binding can continue to do so via `jwksFetch?: (url: string) => Promise<Response>` — the URL is now the per-issuer URL, so the override must handle multiple hosts.
