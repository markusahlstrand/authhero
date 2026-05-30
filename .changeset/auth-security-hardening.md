---
"authhero": patch
"@authhero/adapter-interfaces": patch
---

Security hardening across the auth-api token paths. Defaults stay Auth0-faithful; stricter behavior is opt-in.

- **authorization_code grant**: removed the `DEFAULT_CLIENT` secret fallback in `/oauth/token`. Anyone holding that one secret could previously substitute it for any other client's `client_secret` when exchanging a code. The "temporary" cross-tenant workaround is gone — cross-tenant scenarios must be modeled explicitly.
- **authorization_code grant**: the code is now bound to the client it was issued to (RFC 6749 §10.5 / OIDC Core §3.1.3.2). Exchanging a code with a different `client_id` than the one that initiated `/authorize` is rejected with `invalid_grant`. Status code follows the existing `client.auth0_conformant` pattern from `refresh-token.ts` — `403` by default (Auth0 behavior), `400` when `auth0_conformant === false` (RFC behavior).
- **authorization_code grant**: aligned the existing code-reuse rejection on the same `auth0_conformant` gate. Previously returned `400 invalid_grant` unconditionally; now `403` by default (matching Auth0) and `400` only when the client opts out.
- **passwordless OTP**: added a per-(tenant, username) `brute-force` rate-limit check at the start of `passwordlessGrantUser`. Covers both `/passwordless/verify_redirect` and the `/oauth/token` OTP grant. Opt-in — only active when `data.rateLimit` is configured. A 6-digit numeric OTP is ~20 bits of entropy and was previously brute-forceable inside the 10-minute window. See [Rate Limit Adapter](/customization/adapter-interfaces/rate-limit) for the integration contract.
- **/oauth/revoke**: confidential clients (those with a registered `client_secret`) MUST now authenticate per RFC 7009 §2.1. A missing secret on a confidential client returns `401 invalid_client` rather than silently no-op'ing. Public clients (no registered secret) continue to revoke without authenticating.
- **management-api middleware**: removed the `AUDIENCE_EXEMPT_PREFIXES` carve-out for `/api/v2/users` and `/api/v2/users-by-email`. Tokens hitting these routes must now carry `urn:authhero:management` in `aud`. External callers still issuing tokens with the legacy audience need to migrate.
- **scope filtering**: new tenant flag `flags.restrict_undefined_scopes` (default `false`). When `false` or absent the token's `scope` claim preserves Auth0's legacy behavior — every requested scope, defined on the API or not, is echoed verbatim. When `true`, the claim is restricted to scopes defined on the targeted resource server plus the standard OIDC scopes. Applies symmetrically to RBAC-enabled and RBAC-disabled APIs so the posture is consistent. Opt in for defense-in-depth against scope-string forgery.
