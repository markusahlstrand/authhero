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

## Creating an Application

Applications can be created through the Management API or React Admin interface:

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
