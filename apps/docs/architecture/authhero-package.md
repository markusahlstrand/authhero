---
title: The AuthHero Package
description: The three main parts of the authhero package — Auth API, Management API, and Universal Login.
---

# The AuthHero Package

The `authhero` package is a Hono.js HTTP application that contains all authentication logic. It exposes three distinct API surfaces:

## Auth API (OAuth2/OIDC)

Standard OAuth2 and OpenID Connect endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /authorize` | Authorization endpoint — starts the login flow |
| `POST /oauth/token` | Token endpoint — exchange codes for tokens |
| `GET /userinfo` | Returns claims about the authenticated user |
| `GET /.well-known/openid-configuration` | OIDC discovery document |
| `GET /.well-known/jwks.json` | JSON Web Key Set for token verification |
| `POST /oauth/revoke` | Revoke a refresh token |
| `GET /v2/logout` | End the user's session |

These endpoints implement the standard flows: authorization code (with PKCE), client credentials, refresh token, and device authorization.

## Management API

A REST API compatible with Auth0's Management API v2:

```
/api/v2/users          — User CRUD, search, role assignment
/api/v2/clients        — Application management
/api/v2/connections    — Identity provider configuration
/api/v2/roles          — Role and permission management
/api/v2/organizations  — Organization management and membership
/api/v2/resource-servers — API/audience configuration
/api/v2/hooks          — Webhook configuration
/api/v2/forms          — Custom form definitions
/api/v2/flows          — Authentication flow configuration
/api/v2/tenants        — Tenant settings
```

The Management API is secured with OAuth2 access tokens. Clients request tokens with scopes like `read:users`, `update:clients`, etc.

See [API Reference](/api/overview) for the full endpoint documentation.

## Universal Login

The user-facing authentication UI. AuthHero provides two approaches:

### /u2/ — Widget-Based Login (Current)

The primary login experience, using the `@authhero/widget` web component:

- Client-side rendering with server-driven UI
- Fetches screen configuration from the Auth API
- Supports all authentication methods (password, code, social, enterprise)
- Customizable via CSS custom properties
- Compatible with Auth0's Forms API

### /u/ — Server-Rendered Login (Legacy)

The original server-rendered login pages using JSX:

- Full HTML pages rendered on the server
- Direct form submission
- Being phased out in favor of /u2/

::: info
The `/u2/` widget-based login is the recommended approach. The server-rendered `/u/` login will be deprecated in a future release.
:::

### /u/flow-widget/ — Flow-Based Widget

A hybrid approach combining server-driven flows with the client-side widget:

- Flows configured via the Management API
- Supports custom forms and progressive profiling
- Compatible with Auth0's Forms API schema

## How It All Fits Together

```
User's Browser
     │
     ├─ /authorize ──────────────> Auth API
     │                                │
     │                                ├─ Redirect to /u2/ (Universal Login)
     │                                │
     ├─ /u2/ ────────────────────> Universal Login (widget loads)
     │   └─ widget fetches screen config from Auth API
     │   └─ user authenticates
     │   └─ redirect back with authorization code
     │
     ├─ /oauth/token ────────────> Auth API (exchange code for tokens)
     │
     └─ /api/v2/* ───────────────> Management API (admin operations)
```
