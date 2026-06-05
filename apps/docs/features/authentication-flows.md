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

[Token verification process will be documented here]

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

[Custom authentication flow options will be documented here]

## Security Considerations

[Security best practices will be documented here]
