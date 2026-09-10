---
title: Authentication Flow
description: Understand AuthHero's OAuth 2.0 / OpenID Connect authentication flow including login, token types (ID, access, refresh), and session management.
---

# Authentication Flow

This guide explains the authentication flow in AuthHero, covering login, registration, token handling, and session management.

## Overview

AuthHero implements a standard OAuth 2.0 / OpenID Connect authentication flow, with support for various grant types and authentication methods.

## Login Flow

1. User initiates login at the client application
2. Client redirects to AuthHero login page
3. User enters credentials
4. AuthHero validates credentials
5. On success, AuthHero issues tokens and redirects back to the client application

## Token Types

AuthHero issues several types of tokens:

- **ID Token**: Contains user identity information (JWT format)
- **Access Token**: Grants access to protected resources (JWT format)
- **Refresh Token**: Allows obtaining new access tokens without re-authentication

## Token Verification

ID tokens and access tokens are signed JWTs, and APIs should verify them
**locally** rather than calling back to AuthHero on every request.

### 1. Discover the keys

AuthHero publishes standard OIDC discovery documents:

```http
GET /.well-known/openid-configuration
GET /.well-known/oauth-authorization-server
```

Both advertise a `jwks_uri` pointing at:

```http
GET /.well-known/jwks.json
```

Fetch the JWKS once, cache it, and refresh it when you see a `kid` you don't
recognise (key rotation adds a new key before retiring the old one). Every token
AuthHero issues carries the signing key's `kid` in its JWT header, so pick the
matching key rather than assuming there is only one.

### 2. Verify the signature

The supported signing algorithms are advertised in
`id_token_signing_alg_values_supported` and are currently `RS256`, `ES256`,
`ES384` and `ES512`. Pin your verifier to the algorithms you expect and reject
anything else — never trust the token header's `alg` on its own.

### 3. Check the claims

| Claim         | What to check                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iss`         | Must equal your issuer **exactly**, including the trailing slash as configured. AuthHero does not normalize it, and it is byte-identical to the `issuer` in the discovery document.                            |
| `aud`         | For an **ID token**, the `client_id` it was issued to. For an **access token**, the `audience` requested at `/authorize` (i.e. the resource server identifier). Reject tokens minted for a different audience. |
| `exp` / `iat` | Standard expiry and issued-at checks. Access tokens default to 24 hours, overridable per resource server; impersonation tokens are always 1 hour.                                                              |
| `nonce`       | On an ID token from an interactive flow, must match the `nonce` you sent to `/authorize`.                                                                                                                      |
| `sub`         | The user ID. Use this as the stable account identifier, not `email`.                                                                                                                                           |

Access tokens additionally carry `scope`, `sid` (the session ID), and `org_id`
when the token was issued in an organization context. Custom claims added by
hooks can never overwrite a claim the authorization server owns — colliding
names are dropped. See [Tokens](/entities/security/tokens) for the full claim
reference.

If you need up-to-date profile information rather than proof of authentication,
call [`/userinfo`](/api/endpoints) with the access token instead of reading
profile claims out of the token.

## Refresh Token Flow

Refresh tokens allow your application to obtain new access tokens without requiring the user to re-authenticate.

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=CLIENT_ID&
client_secret=CLIENT_SECRET
```

The response includes a new access token (and optionally an ID token if `openid` scope was requested).

### Organization Switching

When working with [organizations](/entities/identity/organizations), you can switch the organization context during a refresh token exchange by passing the `organization` parameter:

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=CLIENT_ID&
organization=ORG_ID_OR_NAME
```

This enables seamless organization switching in multi-tenant applications without requiring the user to log in again. The behavior is:

- **With `organization` parameter**: Tokens are issued for the specified organization. The user must be a member.
- **Without `organization` parameter**: The original organization from the login session is preserved in the new tokens.

See [Tokens](/entities/security/tokens) for details on organization-related token claims.

## Third-Party Client Consent

Clients have an `is_first_party` flag that defaults to `true`. First-party clients (the default) skip the consent step entirely — the user is signed in, tokens are issued, and the requested `scope` is honored as-is.

Third-party clients (`is_first_party: false`) must hold an explicit per-user consent record covering every non-basic scope they request. The OIDC basic scopes — `openid`, `profile`, `email` — are always exempt.

### Interactive flow

When a third-party client requests a missing scope, AuthHero redirects the still-authenticated session to `/u2/consent` before issuing tokens. The screen lists the scopes that need approval and shows two outcomes:

- **Allow** — the requested scopes are upserted into a `grants` row keyed by `(tenant_id, user_id, client_id, audience)`, the login session transitions out of `AWAITING_CONSENT`, and `/authorize/resume` completes the original flow.
- **Deny** — the login session fails with `consent_denied` and the user is redirected back to `redirect_uri` with `error=access_denied&error_description=User+denied+consent`.

Once a grant exists, future requests from the same client that ask for the same (or a subset of) those scopes skip the screen.

### Silent flow (`prompt=none`)

Silent auth must not silently widen scopes for a third-party client. When the stored consent does not cover every non-basic requested scope, the silent flow returns the OIDC error `consent_required` instead of issuing tokens — same wire shape as Auth0:

```
error=consent_required
error_description=Consent required for scope(s): write:posts
```

For `web_message` (iframe) requests, the error is delivered via `postMessage` to the parent. For redirect-based silent auth, it lands as URL parameters on `redirect_uri` (or in the fragment if `response_type` is not `code`).

Treat it like `login_required`: fall back to an interactive `/authorize` redirect so the user can hit the consent screen.

### Migrating existing deployments

A kysely migration shipped with this feature flips every existing client to `is_first_party: true`, preserving today's no-consent UX. Switch a client to third-party by setting `is_first_party: false` explicitly:

```http
PATCH /api/v2/clients/{client_id}
Content-Type: application/json

{ "is_first_party": false }
```

See the [`grants`](/entities/identity/users#oauth-grants) entity for the underlying storage and the management endpoint.

## Custom Authentication Flows

The flow above can be extended at several points without forking AuthHero.

### Hooks

[Hooks](/features/hooks) run your own logic at fixed points in the flow. Each
hook is registered against a `trigger_id`:

| Trigger                  | When it runs                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `pre-user-registration`  | Before a new user is created — can reject the signup                                           |
| `post-user-registration` | After a user has been created                                                                  |
| `post-user-login`        | After authentication succeeds, before tokens are issued — the usual place to add custom claims |
| `credentials-exchange`   | On the `client_credentials` grant, for machine-to-machine tokens                               |

A hook is either a **webhook** (AuthHero POSTs the event to your URL) or a
**code hook** (a JavaScript function stored on the tenant and run by the
configured code executor, using Auth0-style `onExecutePostLogin` /
`onExecutePreUserRegistration` entry points).

Note that hooks may add claims but may not overwrite the claims the
authorization server owns — see [Token Verification](#token-verification).

### Forms and Flows

[Forms](/features/forms) let you insert extra server-rendered steps (for example
profile completion) into the login journey, and [Flows](/features/flows)
describe the actions taken when a form is submitted. Together they cover most
"ask the user for one more thing before finishing login" cases without custom
code.

### Connections

Which authentication methods a user is offered is a per-tenant, per-client
choice of connections: database (username/password), passwordless email or SMS
one-time codes, social providers, and [SAML](/customization/saml/). A database
connection with `import_mode` enabled additionally supports lazy migration —
credentials are verified against the upstream provider on first login and then
stored locally.

### Multi-factor authentication

[MFA](/features/mfa) adds a challenge step after primary authentication.

### Login UI

The hosted login screens are themeable per tenant through branding and prompt
settings, including whether the identifier and password are collected on one
screen or two. See the [Customization](/customization/) section.

## Security Considerations

- **Always use PKCE for public clients.** A token exchange with no
  `client_secret` is only accepted when the request carries a `code_verifier`
  **and** the stored authorization code carries a `code_challenge` issued at
  `/authorize`. A bare `code_verifier` against a non-PKCE code is not proof of
  possession and is rejected. See [RFC 7636](/standards/rfc-7636).
- **Send and verify `state` and `nonce`.** `state` protects the redirect against
  CSRF; `nonce` binds the ID token to your authorization request. Verify both on
  the way back.
- **Prefer rotating refresh tokens.** Setting a client's
  `refresh_token.rotation_type` to `rotating` issues a new refresh token on each
  exchange. AuthHero detects reuse of an already-rotated token and revokes the
  whole token family; a short `leeway` (30 seconds by default) tolerates
  legitimate retries and races.
- **Keep refresh tokens and client secrets off the browser.** Public clients
  should hold only short-lived access tokens; anything with a `client_secret`
  belongs on a server.
- **Scope tokens to a real audience.** Request the resource server's identifier
  as `audience` and have each API reject tokens issued for a different one. See
  [RBAC and scopes](/features/rbac-and-scopes).
- **Mark external integrations as third-party clients.** Setting
  `is_first_party: false` forces per-user consent instead of silently honoring
  whatever scope the client asks for.
- **Enable attack protection.** Brute-force protection and suspicious-IP
  throttling are per-tenant settings; the IP throttle also needs a rate-limit
  adapter to be configured. See
  [Rate Limiting](/api/overview#rate-limiting).
- **Don't put secrets in custom claims.** Access tokens are readable by anyone
  holding them; treat every claim you add in a hook as public.
- **Revoke on the way out.** Logout should terminate the session, not just drop
  the client's copy of the tokens — see
  [Session management](/features/session-management).

For tenant isolation, Management API authorization and encryption at rest, see
the [Security model](/security/).
