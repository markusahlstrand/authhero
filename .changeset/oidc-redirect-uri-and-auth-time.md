---
"authhero": patch
---

Fix two OIDC conformance failures:

- `redirect_uri` query parameters are now matched exactly for non-wildcard
  registrations. An incoming `redirect_uri` that adds a query parameter not
  present in a registered (exact) callback is now rejected, matching RFC 6749
  §3.1.2.3 and the OIDC `oidcc-redirect-uri-query-added` test. Path/subdomain
  wildcard registrations (e.g. the auth server's own `<issuer>/*` callback) stay
  lenient on extra query parameters.
- `auth_time` is now stable across SSO re-authorizations. When an existing
  session is reused, the login session keeps the session's original
  authentication time instead of resetting it to "now", so id_tokens issued for
  the same session (e.g. with `max_age`) share the same `auth_time`
  (`oidcc-max-age-10000`).
