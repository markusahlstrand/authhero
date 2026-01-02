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
- Long lifetime (days or weeks)
- Can be revoked
- Single-use or rotating (configurable)

**Usage:**

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=CLIENT_ID&
client_secret=CLIENT_SECRET
```

## Token Lifetimes

Token lifetimes are configurable per tenant and application:

- **ID Token**: Typically 10 hours (36000 seconds)
- **Access Token**: Typically 24 hours (86400 seconds)
- **Refresh Token**: Typically 30 days or more

Shorter lifetimes improve security but require more frequent token refreshes.

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

See [Organizations](/concepts/organizations) and [Security Model](/security-model) for more details.

## Session Management

AuthHero maintains server-side sessions in addition to tokens. This allows:

- Centralized logout
- Session revocation
- Security monitoring

See [Session Management](/session-management) for details.

## API Reference

- [POST /oauth/token](/api/endpoints#token-endpoint) - Exchange authorization code or refresh token
- [GET /.well-known/jwks.json](/api/endpoints#jwks-endpoint) - Public keys for token validation
- [POST /oauth/revoke](/api/endpoints#revoke-endpoint) - Revoke refresh token
