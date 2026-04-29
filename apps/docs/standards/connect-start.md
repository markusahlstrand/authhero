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
Browser → GET /connect/start?domain=publisher.com
                            &return_to=https://publisher.com/wp-admin/...
                            &state=<csrf>
                            &integration_type=wordpress  ← optional label
                            &scope=...                   ← optional
AuthHero → 302 /u2/connect/start?state=<login_session_id>
            (universal-login + Stencil widget renders the consent screen)
User     → confirms
AuthHero → mint IAT bound to {sub: user, domain, integration_type?, scope?}
         → 302 return_to?authhero_iat=<token>
                       &authhero_tenant=<tenant_id>   ← only on control-plane flows
                       &state=<csrf>
CMS      → POST /oidc/register
             Authorization: Bearer <iat>
             tenant-id: <authhero_tenant>             ← required if authhero_tenant was returned
             { client_name, redirect_uris, grant_types, ... }
AuthHero → 201 { client_id, client_secret, registration_access_token, ... }
```

If the user cancels: `302 return_to?authhero_error=cancelled&state=<csrf>`. No IAT is minted.

> **Heads up — multi-tenant routing.** When the redirect-back includes `authhero_tenant`, you **must** forward that value as the `tenant-id` request header on `POST /oidc/register`. Without it, AuthHero cannot resolve the tenant the IAT was minted on and registration fails with `Tenant not found`. See [Callback parameters](#callback-parameters) below.

### Control-plane mode (multi-tenancy)

When `/connect/start` is hit on a [multi-tenancy](/customization/multi-tenancy/) control-plane tenant, the user must first pick which child tenant the IAT (and resulting client) belongs to. The flow inserts one extra step between login and consent:

```
Browser → GET /connect/start?...      ← request resolves to control plane
AuthHero → 302 /u2/connect/start?state=<sid>
        → user not signed in: 302 /u2/login/identifier?state=<sid>
        → after login:        302 /u2/connect/select-tenant?state=<sid>
        → user picks workspace: state_data.connect.target_tenant_id is set
        → 302 /u2/connect/start?state=<sid>
        → renders consent (showing the chosen workspace)
User     → confirms
AuthHero → mint IAT on the *child* tenant
         → 302 return_to?authhero_iat=<token>
                       &authhero_tenant=<child_tenant_id>
                       &state=<csrf>
```

The picker lists every organization the signed-in user belongs to on the control plane — each organization name maps 1:1 to a child tenant id (this is the convention enforced by `@authhero/multi-tenancy`'s provisioning hooks). Membership is re-checked when consent is submitted, so a stale `target_tenant_id` cannot be used to mint on a workspace the user has lost access to.

When the request already resolves to a child tenant directly (custom domain or subdomain), the picker is skipped and the IAT is minted on that child — the URL-shape and IAT contents are identical to the single-tenant flow.

## Query parameters

| Parameter | Required | Description |
| --- | --- | --- |
| `integration_type` | no | Optional caller-defined label (e.g. `wordpress`, `ghost`). Surfaced on the consent screen and pre-bound to the IAT/client metadata. Free-form — there is no per-tenant allowlist. |
| `domain` | yes | Logical "thing being connected." May be a bare host[:port] (implicit `https://`) or a fully-qualified origin (`http://127.0.0.1:8888` for local dev). `return_to`'s origin must match. |
| `return_to` | yes | Where the browser is redirected after consent (success or cancel). Origin must match `domain`. URL-encode the value if it contains its own query string. |
| `state` | yes | Caller-supplied CSRF token. Round-tripped on the redirect unchanged. |
| `scope` | no | Space-separated scope list, pre-bound to the IAT. |
| `tenant_id` | no | Explicit tenant override. Used only when host-based resolution doesn't already pick a tenant — see [Tenant resolution](#tenant-resolution). |

## Callback parameters

These appear on the `return_to` URL when AuthHero redirects the browser back. The caller's server-side handler should read them off the URL before performing the `POST /oidc/register` exchange.

| Parameter | When set | Description |
| --- | --- | --- |
| `state` | always | The exact CSRF token the caller passed in on `/connect/start`. Verify it matches the one your handler issued before trusting any other parameter. |
| `authhero_iat` | on success | The Initial Access Token. Send as `Authorization: Bearer <token>` on `POST /oidc/register`. Single-use, 5-minute TTL — consume immediately. |
| `authhero_tenant` | on success, **control-plane flows only** | The child tenant the IAT was minted on. **Required** as the `tenant-id` request header on `POST /oidc/register` whenever this parameter is present, otherwise registration returns `Tenant not found`. Absent on direct-to-child flows (custom domain or subdomain already resolved to the right tenant) — in that case AuthHero resolves the tenant from the host and no header is needed. |
| `authhero_error` | on cancel / failure | Currently only `cancelled`. No IAT is minted. |

A robust caller treats `authhero_tenant` as optional-but-forward-if-present: read it off the redirect, persist it next to the IAT if your flow round-trips through storage, and unconditionally set the `tenant-id` header when forwarding it. Don't try to "guess" the tenant from your own configuration — the only authoritative source is whatever AuthHero put on the redirect.

## Tenant resolution

`/connect/start` uses AuthHero's standard [tenant-resolution chain](/customization/multi-tenancy/subdomain-routing#tenant-resolution-chain). The request must resolve to either the control-plane tenant (which triggers the workspace picker) or directly to a child tenant (which skips the picker).

The most relevant rules for this endpoint, in priority order:

1. Custom domain registered on the `host` / `x-forwarded-host` header (e.g. `auth.acme.com` → tenant `acme`).
2. Subdomain matching a tenant id (e.g. `acme.auth.example.com` → tenant `acme`).
3. Explicit `tenant_id` query parameter — the fallback used when neither of the above matches.

If you're calling the default AuthHero URL (no per-tenant custom domain, no tenant subdomain), append `&tenant_id=<control-plane-id>` so the request resolves to the control plane and the workspace picker is shown. Integrators that already address a child tenant directly via custom domain or subdomain don't need to pass it.

## Tenant configuration

Enable on the tenant:

```json
{
  "flags": {
    "enable_dynamic_client_registration": true,
    "allow_http_return_to": ["http://dev.publisher.test:8080"]
  }
}
```

`enable_dynamic_client_registration` is the only required flag. If it is unset, `/connect/start` returns 404 — the consent flow is disabled for the tenant.

`allow_http_return_to` is a per-tenant allowlist of fully-qualified `http://` origins (scheme + host + port, no path) that may appear as `domain` / `return_to` despite not being loopback. Defaults to `[]`. Loopback origins (`localhost`, `127.0.0.1`, `[::1]`) are accepted regardless of this list.

## Pre-bound IAT constraints

When the user confirms, the issued IAT carries these constraints (enforced server-side at `POST /oidc/register`):

```json
{
  "domain": "publisher.com",
  "integration_type": "wordpress", // only if integration_type was supplied
  "grant_types": ["client_credentials"],
  "scope": "..."                    // only if scope was supplied
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

- `return_to` and `domain` must agree on scheme + host + port.
- HTTPS is always permitted. HTTP is permitted only when:
  1. The host is loopback — `localhost`, `127.0.0.1`, or `[::1]` (any port). Aligned with [RFC 8252 §7.3](https://datatracker.ietf.org/doc/html/rfc8252#section-7.3).
  2. The exact origin (scheme + host + port) appears in the tenant's `allow_http_return_to` list.
- `0.0.0.0` is always rejected (resolves differently across stacks). `localhost.<anything>` is rejected (suffixes are not pattern-matched). Trailing dots and case variations are normalized before comparison.
- IAT is exposed as a query param on `return_to`. Single-use + 5-min TTL bound the exposure window. The receiving server should consume it immediately and not retain it.
- When `domain` resolves to a loopback host or matches the tenant allowlist, the consent screen shows a "Local development" badge so users can spot a phishing attempt that claims a `localhost` callback they didn't initiate.
- Cancel never mints a token.

## Related

- [RFC 7591 — Dynamic Client Registration](/standards/rfc-7591)
- [RFC 7592 — DCR Management](/standards/rfc-7592)
- [Multi-tenancy: consent-mediated DCR](/customization/multi-tenancy/control-plane#consent-mediated-dcr-connect-start) — control-plane workspace picker, integrator callback handling, and choosing between control-plane and direct-to-child entry points.
