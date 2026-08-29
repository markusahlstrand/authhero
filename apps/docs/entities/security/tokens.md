---
title: Tokens
description: Understand the different token types in AuthHero including ID tokens, access tokens, and refresh tokens with their claims and usage patterns.
---

# Tokens

AuthHero generates various types of tokens during the authentication process. Understanding these tokens is essential for implementing secure authentication and authorization.

## Token Types

### ID Tokens

ID tokens contain user identity information in JWT format. They are intended for the client application to learn about the authenticated user.

**Key Claims:**

```json
{
  "iss": "https://auth.example.com/",
  "sub": "auth0|user123",
  "aud": "client_abc123",
  "exp": 1735894800,
  "iat": 1735891200,
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "picture": "https://example.com/photo.jpg"
}
```

- `iss`: Issuer (your AuthHero instance)
- `sub`: Subject (user ID)
- `aud`: Audience (your application's client ID)
- `exp`: Expiration timestamp
- Additional user profile claims

### Access Tokens

Access tokens grant access to protected APIs (resource servers). They contain authorization information like scopes and permissions.

**Key Claims:**

```json
{
  "iss": "https://auth.example.com/",
  "sub": "auth0|user123",
  "aud": ["https://api.example.com"],
  "exp": 1735894800,
  "scope": "read:users write:users",
  "permissions": ["read:users", "write:users"],
  "org_id": "org_abc123"
}
```

- `aud`: Resource server identifier(s)
- `scope`: OAuth scopes
- `permissions`: Specific permissions from RBAC roles
- `org_id`: Organization context (if applicable)

Access tokens should be validated by your API before granting access to protected resources.

### Refresh Tokens

Refresh tokens allow obtaining new access tokens without requiring the user to re-authenticate. They are long-lived and should be stored securely.

**Characteristics:**

- Opaque strings (not JWTs)
- Lifetime configured per application — see [Refresh token lifetimes](#refresh-token-lifetimes) below
- Can be revoked, individually or per user
- Single-use or rotating (configurable via the client's `refresh_token.rotation_type`)

A refresh token is bound to the session it was minted from. Revoking or deleting
that session revokes the token with it, so a centralized logout takes the
refresh token down too.

**Usage:**

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=CLIENT_ID&
client_secret=CLIENT_SECRET
```

**Organization Switching:**

You can pass an optional `organization` parameter when refreshing tokens to switch the organization context without requiring the user to re-authenticate:

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=CLIENT_ID&
organization=org_abc456
```

If no `organization` parameter is provided, the original organization from the login session is preserved. The new tokens will include the `org_id` and `org_name` claims for the target organization. The user must be a member of the target organization.

## Token Lifetimes

Token lifetimes are configurable per tenant and application:

- **ID Token**: Typically 10 hours (36000 seconds)
- **Access Token**: Typically 24 hours (86400 seconds)
- **Refresh Token**: see below

Shorter lifetimes improve security but require more frequent token refreshes.

### Refresh token lifetimes

Refresh-token expiry and session expiry are two separate concepts, as in Auth0.
Refresh-token expiry is configured **per application**, in seconds, under the
client's `refresh_token` object; session expiry is configured **per tenant**, in
hours. Each refresh token carries two independent windows:

- **Absolute** — how long the token is valid regardless of use.
- **Idle (sliding)** — how long the token survives without being exchanged.
  Re-stamped on every successful exchange.

Each window resolves in this order, first match wins:

| Order | Absolute window                     | Idle window                              | Result                        |
| ----- | ----------------------------------- | ---------------------------------------- | ----------------------------- |
| 1     | `refresh_token.expiration_type: "non-expiring"` | same setting                 | Never expires — this is the master switch and overrides both windows |
| 2     | `refresh_token.infinite_token_lifetime: true` | `refresh_token.infinite_idle_token_lifetime: true` | That window never expires |
| 3     | `refresh_token.token_lifetime` (seconds) | `refresh_token.idle_token_lifetime` (seconds) | Expires after that many seconds |
| 4     | tenant `session_lifetime` (hours)   | tenant `idle_session_lifetime` (hours)   | Falls back to the tenant setting |
| 5     | neither set                         | neither set                              | No expiry stamped             |

A zero, negative or absent value at either level counts as unset and falls
through to the next row, so tenants that never configured per-client lifetimes
keep exactly the behaviour they had before.

Two consequences worth knowing:

- **Refreshing never extends the absolute window.** Exchanging a token slides
  the idle expiry forward but leaves the absolute expiry stamped at mint, so a
  bounded token cannot outlive it by being used.
- **A token minted without an idle window is not retro-fitted with one.** If you
  add an `idle_token_lifetime` later, existing tokens keep no idle expiry until
  they rotate. Switching a client to `non-expiring` does propagate: it clears
  expiries that were already stamped.

`refresh_token.rotation_type` (`rotating` / `non-rotating`, defaulting to
`non-rotating`) and `refresh_token.leeway` (seconds, default 30) control
rotation rather than lifetime.

See [Applications](/entities/configuration/applications) for where these live on
the client.

## Token Validation

### Validating ID Tokens

1. Verify the signature using the public key from `/.well-known/jwks.json`
2. Check `iss` matches your AuthHero instance
3. Check `aud` matches your application's client ID
4. Check `exp` hasn't passed
5. Extract user information from claims

### Validating Access Tokens

1. Verify the signature
2. Check `iss` matches your AuthHero instance
3. Check `aud` includes your API identifier
4. Check `exp` hasn't passed
5. Check `permissions` or `scope` includes required permissions

## Organization Tokens

When authenticating with an organization context, tokens include organization-specific claims:

```json
{
  "org_id": "org_abc123",
  "org_name": "Acme Corporation"
}
```

Your API can use these claims to enforce organization-level access control.

See [Organizations](/entities/identity/organizations) and [Security Model](/security/) for more details.

## Session Management

AuthHero maintains server-side sessions in addition to tokens. This allows:

- Centralized logout
- Session revocation
- Security monitoring

See [Session Management](/features/session-management) for details.

## API Reference

- [POST /oauth/token](/api/endpoints#token-endpoint) - Exchange authorization code or refresh token
- [GET /.well-known/jwks.json](/api/endpoints#jwks-endpoint) - Public keys for token validation
- [POST /oauth/revoke](/api/endpoints#revoke-endpoint) - Revoke refresh token
- [GET /api/v2/users/{user_id}/refresh-tokens](/api/endpoints#refresh-tokens) - List a user's refresh tokens
- [DELETE /api/v2/users/{user_id}/refresh-tokens](/api/endpoints#refresh-tokens) - Revoke all of a user's refresh tokens
- [GET | DELETE /api/v2/refresh-tokens/{id}](/api/endpoints#refresh-tokens) - Read or revoke a single refresh token
