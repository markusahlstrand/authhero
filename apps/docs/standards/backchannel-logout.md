---
title: OIDC Back-Channel Logout 1.0
description: AuthHero's implementation of the OpenID Connect Back-Channel Logout 1.0 specification.
---

# OpenID Connect Back-Channel Logout 1.0

**Spec:** [openid.net/specs/openid-connect-backchannel-1_0.html](https://openid.net/specs/openid-connect-backchannel-1_0.html)
**Status:** Partial

Back-Channel Logout notifies Relying Parties server-to-server when a session ends, instead of relying on the user's browser. When a session that a client participated in is revoked, AuthHero POSTs a signed **logout token** to every back-channel logout URL registered on that client.

## Registering a client

Opt-in is per client: register one or more URLs under `oidc_logout.backchannel_logout_urls`.

```http
PATCH /api/v2/clients/{id}
{
  "oidc_logout": {
    "backchannel_logout_urls": ["https://app.example.com/backchannel-logout"]
  }
}
```

A client with no registered URLs never receives logout tokens. The Auth0-shaped `oidc_logout.backchannel_logout_initiators` object (`mode`, `selected_initiators`) is accepted and stored for compatibility but **not yet enforced** — every session-end initiator currently notifies.

## When tokens are sent

A logout token is delivered to each participating client (tracked in `session.clients`, deduplicated) when a session is revoked via:

| Trigger | Endpoint |
| ------- | -------- |
| Auth0-style logout | `GET /v2/logout` |
| [RP-Initiated Logout](/standards/oidc-rp-initiated-logout) | `GET /oidc/logout` |
| Management API session delete | `DELETE /api/v2/sessions/{id}` |
| Management API session revoke | `POST /api/v2/sessions/{id}/revoke` |

Delivery happens **after** the revocation commits, so an RP that reacts to the token by calling back into AuthHero observes the session as already gone.

Session-end paths that do **not** currently notify: password-change and user-deletion driven session revocation, and RFC 7009 token revocation (`POST /oauth/revoke`).

## Logout token

One token is minted per client (`aud` is always a single client id, never an array) and signed with the tenant's JWT signing key — the same key published on `/.well-known/jwks.json`:

```json
{
  "alg": "RS256",
  "typ": "logout+jwt",
  "kid": "..."
}
{
  "iss": "https://<your-domain>/",
  "aud": "<client_id>",
  "sub": "<user_id>",
  "sid": "<session_id>",
  "jti": "<unique id>",
  "events": { "http://schemas.openid.net/event/backchannel-logout": {} },
  "iat": 1720000000,
  "exp": 1720000120
}
```

- `sub` and `sid` are both always present (AuthHero sessions are always user-bound).
- No `nonce` claim, per spec §2.4.
- Lifetime is fixed at **120 seconds** — RPs with more than ~2 minutes of clock skew will reject tokens.

## Delivery mechanics

- `POST` with `content-type: application/x-www-form-urlencoded`, body `logout_token=<jwt>`, and `cache-control: no-store`; the response body is discarded — only the status code matters (§2.8).
- Runs in the background (`waitUntil`), all targets in parallel, with a **5 second timeout** per request. A slow or dead RP never blocks or fails the logout itself.
- Delivery is **best-effort fire-and-forget**: no retries, no queue, and no persisted delivery outcome. Failures are logged to the console only.
- Target URLs pass an SSRF guard: in production only `https:` URLs are allowed and literal private/loopback addresses are refused (set `ALLOW_PRIVATE_OUTBOUND_FETCH=true` in local development to relax this). The guard does not resolve DNS, so production deployments should still restrict egress at the network level.

## Discovery

Advertised unconditionally in `/.well-known/openid-configuration`:

```json
{
  "backchannel_logout_supported": true,
  "backchannel_logout_session_supported": true
}
```

(The `oidc_logout.rp_logout_end_session_endpoint_discovery` tenant flag only gates `end_session_endpoint`; it does not affect these flags or back-channel delivery.)

## Not implemented

- **Front-channel logout** (`frontchannel_logout_uri`) — not implemented at all.
- `backchannel_logout_session_required` — not read; `sid` is always included regardless, which is why `backchannel_logout_session_supported: true` is accurate.
- `backchannel_logout_initiators` filtering — stored but not enforced.
- Delivery retries / dead-lettering, and `SUCCESSFUL_OIDC_BACKCHANNEL_LOGOUT` / `FAILED_OIDC_BACKCHANNEL_LOGOUT` log events (the log types exist as Auth0-compat placeholders but are never emitted).

## Related AuthHero documentation

- [OIDC RP-Initiated Logout 1.0](/standards/oidc-rp-initiated-logout)
- [Session Management](/features/session-management)
- [OpenID Connect Discovery](/standards/openid-connect-discovery)
- [Conformance Testing](/standards/conformance)
