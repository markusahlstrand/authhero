---
title: API Overview
description: Overview of the AuthHero API including authentication methods, base URLs, response formats, rate limiting, and versioning.
---

# API Overview

This document provides an overview of the AuthHero API.

## Authentication

Management API requests are authenticated with a bearer token:

```http
Authorization: Bearer <access_token>
```

The token is a normal AuthHero access token, and every endpoint requires the
scopes listed in its OpenAPI definition (for example `read:users` on
`GET /api/v2/users`). There is no API-key header — obtain a token through the
`client_credentials` grant or the admin UI's own login, and see
[Management API Security](/security/management-api) for how the token is
validated and scoped to a tenant.

The OAuth endpoints (`/authorize`, `/oauth/token`, `/userinfo`, …) use the
standard OAuth 2.0 client authentication mechanisms instead — see
[Endpoints](endpoints.md).

## Base URL

The base URL for API requests depends on your AuthHero configuration:

- Default: `https://api.yourdomain.com`
- Custom domain: `https://auth.yourdomain.com`

## Response Format

Management API responses, and the JSON responses of the OAuth endpoints, return
the resource (or a collection) **directly** — there is no wrapper envelope:

```json
{
  "user_id": "email|abc123",
  "email": "user@example.com"
}
```

List endpoints return a bare array by default, or an Auth0-style totals envelope
when `include_totals=true`; checkpoint pagination returns the items plus a `next`
cursor. See [Pagination](pagination.md).

JSON errors are returned as a flat object rather than nested under the success
payload. Not every failure is JSON, though: `/authorize` reports errors back
through the redirect it was given — as query or fragment parameters, or as a
`postMessage` for `response_mode=web_message` — so a client must not blindly
parse an `/authorize` response as JSON. See [Error Codes](error-codes.md) for
the exact shapes of both.

## Rate Limiting

Rate limiting is **optional and adapter-provided**. AuthHero itself ships no
built-in counter: the host application supplies a `rateLimit` adapter
implementing `consume(scope, key)` (see `RateLimitAdapter` in
`@authhero/adapter-interfaces`), typically backed by a Cloudflare Workers Rate
Limiter binding. If no adapter is configured, none of the adapter-backed scopes
below run — brute-force protection is the one attack protection that survives
without it, see [Attack protection](#attack-protection).

Three logical scopes are defined. The numeric threshold and window for each are
chosen by the backend at deploy time — they are not tenant-configurable, and the
Cloudflare binding in particular only supports 10- or 60-second windows, so it
is a burst guard rather than a daily cap:

| Scope                   | Where it is consumed                                                     | Key                                     |
| ----------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `pre-login`             | Before a password grant is evaluated                                     | `<tenant_id>:<ip>`                      |
| `brute-force`           | Before a passwordless OTP code is looked up, so failed guesses count too | `passwordless:<tenant_id>:<identifier>` |
| `pre-user-registration` | Reserved; no call site in the core package yet                           | —                                       |

Any scope the backend has no configuration for returns `{ allowed: true }`, so
you can enable them one at a time.

When a limit is exceeded the request fails with `429 Too Many Requests` and the
code `TOO_MANY_REQUESTS`; the passwordless path also sets a `Retry-After` header
when the backend supplies one. If the adapter itself throws, AuthHero **fails
open** — a misbehaving rate limiter must never lock users out.

### Attack protection

Two tenant-level attack-protection controls sit on top of the scopes above:

- **Suspicious IP throttling** — this _is_ the `pre-login` check above, so it
  needs the `rateLimit` adapter as well as the tenant's
  `attack_protection.suspicious_ip_throttling.enabled` flag; without an adapter
  it does not run at all. When both are in place it skips IPs on that section's
  `allowlist`.
- **Brute-force protection** — password logins are refused with `403` and the
  code `TOO_MANY_FAILED_LOGINS` after 3 failed attempts within 5 minutes. The
  counter is stored against the user's primary (linked) account and is cleared
  by a successful login or a password reset. This one is _not_ adapter-backed —
  it counts against the user record and applies whether a `rateLimit` adapter
  is configured or not. Other authentication methods (OTP, social login) remain
  available while the account is throttled.

Both sections are readable and writable through
`/api/v2/attack-protection/suspicious-ip-throttling` and
`/api/v2/attack-protection/brute-force-protection`.

## Versioning

The Management API is versioned in the path and is served under `/api/v2/`,
matching Auth0's Management API v2. The OAuth and OIDC endpoints are not
versioned — they live at their standard paths (`/authorize`, `/oauth/token`,
`/.well-known/openid-configuration`, …).

## Endpoints

See the [Endpoints](endpoints.md) page for a complete list of available API endpoints.

## Forms

For details on the forms system, including form structure, components, and implementation, see the [Forms](/features/forms) documentation.

## Flows

For details on the flows system, including action types, execution logic, and redirect actions, see the [Flows](/features/flows) documentation.

## Error Handling

See the [Error Codes](error-codes.md) page for details on error responses and status codes.
