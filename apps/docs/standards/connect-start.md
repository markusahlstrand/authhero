---
title: Connect Start — Consent-mediated DCR
description: AuthHero-specific browser flow that mints an RFC 7591 Initial Access Token bound to user consent.
---

# Connect Start — Consent-mediated DCR

**Status:** Stable
**Spec:** AuthHero extension (not part of any RFC)

`/connect/start` is an AuthHero-specific endpoint that bridges the gap between *"a user just consented in their browser"* and *"a server-side client needs an [RFC 7591 Initial Access Token](/standards/rfc-7591) to register itself."*

It is the browser-driven counterpart to `POST /api/v2/client-registration-tokens` (the Management API IAT-mint endpoint). Both paths produce the same kind of IAT, which the recipient then presents to `POST /oidc/register` to create a client.

## Why this exists

Auth0's `/oidc/register` is open and unauthenticated — anyone can create a client. AuthHero supports both that mode and a gated mode where every registration must carry a valid IAT. The IAT can pre-bind metadata (e.g. `domain`, `grant_types`) that the resulting client cannot deviate from.

For the canonical Sesamy-CMS use case ("a WordPress publisher connects their site to my Sesamy account"), we need the IAT to be tied to a specific user's consent, captured in their browser. `/connect/start` is the consent screen and the issuance step combined.

## Flow

```
Browser → GET /connect/start?integration_type=wordpress
                            &domain=publisher.com
                            &return_to=https://publisher.com/wp-admin/...
                            &state=<csrf>
                            &scope=...        ← optional
AuthHero → 302 /u2/connect/start?state=<login_session_id>
            (universal-login + Stencil widget renders the consent screen)
User     → confirms
AuthHero → mint IAT bound to {sub: user, domain, integration_type, scope}
         → 302 return_to?authhero_iat=<token>&state=<csrf>
CMS      → POST /oidc/register
             Authorization: Bearer <iat>
             { client_name, redirect_uris, grant_types, ... }
AuthHero → 201 { client_id, client_secret, registration_access_token, ... }
```

If the user cancels: `302 return_to?authhero_error=cancelled&state=<csrf>`. No IAT is minted.

## Query parameters

| Parameter | Required | Description |
| --- | --- | --- |
| `integration_type` | yes | A caller-defined identifier. Tenant must allowlist it via `flags.dcr_allowed_integration_types`. |
| `domain` | yes | Logical "thing being connected." `return_to`'s origin must be `https://<domain>`. |
| `return_to` | yes | Where the browser is redirected after consent (success or cancel). Origin must match `domain`. |
| `state` | yes | Caller-supplied CSRF token. Round-tripped on the redirect unchanged. |
| `scope` | no | Space-separated scope list, pre-bound to the IAT. |

## Tenant configuration

Enable on the tenant:

```json
{
  "flags": {
    "enable_dynamic_client_registration": true,
    "dcr_allowed_integration_types": ["wordpress", "ghost", "drupal"]
  }
}
```

If `dcr_allowed_integration_types` is empty/unset, `/connect/start` returns 404 — the consent flow is disabled for the tenant.

## Pre-bound IAT constraints

When the user confirms, the issued IAT carries these constraints (enforced server-side at `POST /oidc/register`):

```json
{
  "domain": "publisher.com",
  "integration_type": "wordpress",
  "grant_types": ["client_credentials"],
  "scope": "..."          // only if scope was supplied
}
```

If the registration request supplies any of those fields with a different value, registration fails with `400 invalid_client_metadata`. Omitted fields are filled in from the IAT.

## IAT properties

- 256 bits of entropy, base64url-encoded.
- Stored as SHA-256 hash; the plaintext is never persisted.
- `single_use=true`: invalidated on first successful `/oidc/register`.
- `expires_at = now + 5 min`.
- `sub` set to the authenticated user's ID — preserved on the resulting client as `owner_user_id` after registration.

## Security

- `return_to` origin must exactly match `https://<domain>` (scheme + host + port). HTTP is rejected.
- `integration_type` must appear in the per-tenant allowlist.
- IAT is exposed as a query param on `return_to`. Single-use + 5-min TTL bound the exposure window. The receiving server should consume it immediately and not retain it.
- Cancel never mints a token.

## Related

- [RFC 7591 — Dynamic Client Registration](/standards/rfc-7591)
- [RFC 7592 — DCR Management](/standards/rfc-7592)
