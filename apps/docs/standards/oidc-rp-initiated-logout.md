---
title: OIDC RP-Initiated Logout 1.0
description: AuthHero's implementation of the OpenID Connect RP-Initiated Logout 1.0 specification.
---

# OpenID Connect RP-Initiated Logout 1.0

**Spec:** [openid.net/specs/openid-connect-rpinitiated-1_0.html](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
**Status:** Partial

RP-Initiated Logout lets a Relying Party (RP) ask the OpenID Provider (OP) to terminate the End-User's session and optionally redirect the browser back to a registered URL. AuthHero exposes the endpoint at `GET /oidc/logout` and advertises it in the discovery document as `end_session_endpoint`.

## Endpoint

```
GET /oidc/logout
  ?id_token_hint=<signed id_token>
  &client_id=<client-id>
  &post_logout_redirect_uri=<registered-uri>
  &state=<opaque-value>
  &logout_hint=<value>           # accepted, ignored
  &ui_locales=<lang-tags>        # accepted, ignored
```

All parameters are optional; the OP MUST handle requests with any subset.

| Parameter | Behavior |
| --------- | -------- |
| `id_token_hint` | Signed JWT previously issued to the RP. Signature is verified against the JWKS; failures return `400`. The `aud` claim identifies the client. |
| `client_id` | Identifies the client when no `id_token_hint` is supplied. When both are present, `client_id` MUST equal `aud` from the `id_token_hint`. |
| `post_logout_redirect_uri` | Must be registered for the client. Compared against `allowed_logout_urls` using **Simple String Comparison** (RFC 3986 §6.2.1) per OIDC RP-Initiated Logout 1.0 §2 — exact match including query/fragment, **no** wildcards. Without `id_token_hint` or `client_id` AuthHero refuses to redirect. |
| `state` | Echoed back as a query parameter on the redirect. Has no effect when no redirect occurs. |
| `logout_hint`, `ui_locales` | Accepted for spec compliance; AuthHero does not yet act on them. |

## Behavior

| Scenario | Response |
| -------- | -------- |
| Valid `id_token_hint` and registered `post_logout_redirect_uri` | `302` to `post_logout_redirect_uri` with `state` appended. Session and refresh tokens are revoked, audit logs written, session cookie cleared. |
| Valid `id_token_hint`, no `post_logout_redirect_uri` | `200` with a static "You are signed out" HTML page. Session cleared. |
| `client_id` only (no `id_token_hint`) | Same as above, scoped to the client. |
| No parameters at all | `200` with the signed-out page. Session cookie is *not* cleared because the tenant cannot be resolved. |
| `id_token_hint` signature invalid | `400` — session is **not** terminated (per spec §3 the OP MUST NOT log the user out on invalid signatures). |
| `post_logout_redirect_uri` not registered for the client | `400` — the OP never redirects to an unregistered URL. |
| `client_id` and `id_token_hint.aud` disagree | `400`. |
| `post_logout_redirect_uri` supplied without `id_token_hint` or `client_id` | `400` — there is no client context against which to validate. |

When the registered URI itself contains a query string (e.g. `https://app.example/cb?env=prod`), the RP must request that exact URI; the redirect then preserves those query parameters and appends (or replaces) `state`.

## Session and token cleanup

When the request resolves a client and locates an active session — either by the `sid` claim in `id_token_hint` or the AuthHero session cookie — AuthHero atomically:

1. Soft-revokes every refresh token bound to the originating login session (`revokeByLoginSession`).
2. Sets `revoked_at` on the session row.
3. Writes a `SUCCESS_REVOCATION` audit event when ≥1 refresh token was revoked.
4. Writes a `SUCCESS_LOGOUT` audit event.
5. Returns `Set-Cookie` headers that clear the partitioned and non-partitioned variants of the session cookie.

If only the front-channel cookie is sent (no `id_token_hint.sid`), the cookie's session id is used as a fallback.

## Discovery

The endpoint is opt-in per tenant. Set the `oidc_logout.rp_logout_end_session_endpoint_discovery` tenant flag to `true` to advertise it:

```json
{
  "end_session_endpoint": "https://<your-domain>/oidc/logout"
}
```

This matches Auth0's behavior, which keeps the endpoint hidden until OIDC RP-Initiated Logout is explicitly enabled.

## Differences from `/v2/logout`

AuthHero also ships an Auth0-compatible `GET /v2/logout` route. The two endpoints share session-revocation logic but differ on the surface:

| | `/oidc/logout` | `/v2/logout` |
| --- | --- | --- |
| Spec | OIDC RP-Initiated Logout 1.0 | Auth0 proprietary |
| Token-bound logout | `id_token_hint` (signed JWT) | none |
| Client identification | `client_id` or `id_token_hint.aud` | `client_id` |
| Post-logout redirect | `post_logout_redirect_uri` + echoed `state` | `returnTo` |
| Bad redirect | `400`, no redirect | `400`, no redirect |
| Unknown client | `400` | `200 OK` text |
| Discovery | Advertised when tenant flag is on | Not advertised |

Both endpoints use the same `allowed_logout_urls` registration list on the client.

## Related AuthHero documentation

- [OpenID Connect Discovery](/standards/openid-connect-discovery)
- [OpenID Connect Core](/standards/openid-connect-core)
- [Sessions](/entities/identity/sessions)
- [Conformance Testing](/standards/conformance)
