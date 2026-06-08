---
"authhero": major
"@authhero/proxy": minor
---

Make `proxyControlPlane` authentication opinionated. The host callback
(`authenticate: (request: Request) => Promise<boolean> | boolean`) is removed;
authhero now verifies the bearer JWT internally.

**Breaking** — `AuthHeroConfig.proxyControlPlane` shape changed:

```diff
 proxyControlPlane: {
   resolveHost,
-  authenticate: (req) => { /* host-supplied JWKS+iss+scope check */ },
+  jwksUrl: `${env.ISSUER}/.well-known/jwks.json`,
+  jwksFetch: (url) => env.JWKS_SERVICE.fetch(url), // optional
   applySyncEvents,
 }
```

Verifier behavior: accepts RS256/384/512 and ES256/384/512; requires the
`proxy:resolve_host` scope; matches `iss` against the runtime `env.ISSUER`
via strict URL equality after trailing-slash normalization (no host-only or
subdomain match — `https://issuer.example.com/` is *not* equivalent to
`https://other.example.com/` or `https://issuer.example.com/path/`).

`@authhero/proxy` now exports `PROXY_RESOLVE_HOST_SCOPE` so client and server
share the constant, and `createHttpProxyAdapter` requests this scope in its
`client_credentials` grant (overridable via the new `scope` option).
