---
"authhero": patch
---

Reduce `/authorize?connection=…` to the minimum per-request data calls (1 × `loginSessions.get` + 1 × `codes.create` on a warm cache):

- **Deduped login-session read**: the `/authorize` handler already loads the login session for `state` hydration; it now hands that result to `connectionAuth` instead of letting it re-fetch the same session (previously two uncached `loginSessions.get` round-trips per social-login redirect). The universal-login identifier HRD path passes its already-loaded session the same way.
- **Auto-detect skipped for client-keyed `/authorize`**: when `/authorize` carries a registered (non-CIMD) `client_id`, the tenant always comes from the client lookup, so `tenantMiddleware` no longer pays the single-tenant `tenants.list` fallback query. CIMD client_ids (https URLs) keep the host-derived resolution.

A call-count regression test pins the warm-path floor for the connection flow: one `loginSessions.get`, one `codes.create` (the `oauth2_state` code intentionally stays a DB row), and zero raw reads for middleware fallbacks or bundle-covered config.
