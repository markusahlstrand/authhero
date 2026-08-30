---
title: Applications
description: Learn about applications (OAuth clients) in AuthHero including web apps, SPAs, mobile apps, and machine-to-machine services with their configuration options.
---

# Applications

Applications represent client applications that use AuthHero for authentication. Each application has its own settings, redirect URIs, and other configuration options.

## What is an Application?

An application (also called a "client" in OAuth terminology) is any software that needs to authenticate users through AuthHero:

- Web applications
- Mobile apps
- Single-page applications (SPAs)
- Machine-to-machine services
- Native desktop applications

## Application Types

### Regular Web Applications

Server-side applications that can securely store client secrets:

```typescript
{
  "client_id": "web_app_123",
  "app_type": "regular_web",
  "allowed_callback_urls": ["https://app.example.com/callback"],
  "allowed_logout_urls": ["https://app.example.com"]
}
```

### Single-Page Applications (SPAs)

Browser-based applications that cannot securely store secrets:

```typescript
{
  "client_id": "spa_app_123",
  "app_type": "spa",
  "allowed_callback_urls": ["https://app.example.com/callback"],
  "token_endpoint_auth_method": "none" // Public client
}
```

### Machine-to-Machine

Backend services that authenticate without user interaction:

```typescript
{
  "client_id": "m2m_service_123",
  "app_type": "non_interactive",
  "grant_types": ["client_credentials"]
}
```

## Application Settings

Key configuration options for applications:

- **Client ID**: Unique identifier for the application
- **Client Secret**: Secret key for server-side applications (optional)
- **Callback URLs**: Allowed redirect URLs after authentication
- **Logout URLs**: Allowed redirect URLs after logout
- **Grant Types**: OAuth grant types the application can use
- **Token Endpoint Auth Method**: How the application authenticates to the token endpoint
- **CORS**: Cross-origin resource sharing settings for web applications
- **Refresh Tokens**: Rotation and lifetime settings — see below

### Refresh Tokens

The client's `refresh_token` object configures how refresh tokens issued to this
application rotate and expire. It maps to the **Refresh Tokens** tab in the
Admin UI.

| Field                          | Type                            | Default          | Description                                                                     |
| ------------------------------ | ------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `rotation_type`                | `rotating` \| `non-rotating`    | `non-rotating`   | Whether a token is replaced on every exchange (Auth0 `rotating` behaviour)          |
| `leeway`                       | seconds (0–600)                 | `30`             | Grace window after a parent token's first rotation in which presenting it again mints a sibling instead of tripping reuse detection |
| `expiration_type`              | `expiring` \| `non-expiring`    | `expiring`       | Master switch. `non-expiring` overrides both the absolute and the idle lifetime      |
| `token_lifetime`               | seconds                         | tenant `session_lifetime` | Absolute lifetime — how long the token is valid regardless of use          |
| `infinite_token_lifetime`      | boolean                         | `false`          | No absolute expiry (overrides `token_lifetime`)                                     |
| `idle_token_lifetime`          | seconds                         | tenant `idle_session_lifetime` | Idle (sliding) lifetime, re-stamped on every exchange                 |
| `infinite_idle_token_lifetime` | boolean                         | `false`          | No idle expiry (overrides `idle_token_lifetime`)                                    |

```typescript
PATCH /api/v2/clients/{id}
{
  "refresh_token": {
    "rotation_type": "rotating",
    "expiration_type": "expiring",
    "token_lifetime": 2592000,      // 30 days, absolute
    "idle_token_lifetime": 1296000  // 15 days without use
  }
}
```

Lifetimes here are in **seconds**, while the tenant-level `session_lifetime` /
`idle_session_lifetime` fallbacks are in **hours**. See
[Token Lifetimes](/entities/security/tokens#refresh-token-lifetimes) for the
full precedence order.

## Creating an Application

Applications can be created through the Management API or the [Admin UI](/apps/admin/):

```typescript
POST /api/v2/clients
{
  "name": "My Web App",
  "app_type": "regular_web",
  "allowed_callback_urls": ["https://app.example.com/callback"],
  "allowed_logout_urls": ["https://app.example.com"],
  "allowed_web_origins": ["https://app.example.com"]
}
```

## API Reference

- [GET /api/v2/clients](/api/endpoints#get-clients)
- [POST /api/v2/clients](/api/endpoints#create-client)
- [PATCH /api/v2/clients/:id](/api/endpoints#update-client)
- [DELETE /api/v2/clients/:id](/api/endpoints#delete-client)
