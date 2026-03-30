---
title: Management API Security
description: How the AuthHero Management API is authenticated and authorized.
---

# Management API Security

The Management API (`/api/v2/*`) is protected by OAuth2 access tokens. This page explains how authentication and authorization work for management operations.

## Authentication

To call the Management API, obtain an access token using the client credentials flow:

```http
POST /oauth/token
{
  "client_id": "your-management-client-id",
  "client_secret": "your-management-client-secret",
  "audience": "https://your-auth-domain/api/v2/",
  "grant_type": "client_credentials"
}
```

Include the token in the `Authorization` header:

```http
GET /api/v2/users
Authorization: Bearer {access_token}
```

## Scopes

Management API access is controlled by scopes. Request only the scopes your application needs:

| Scope | Access |
| --- | --- |
| `read:users` | List and get users |
| `create:users` | Create new users |
| `update:users` | Update user properties |
| `delete:users` | Delete users |
| `read:clients` | List and get applications |
| `update:clients` | Update application settings |
| `read:connections` | List and get connections |
| `read:roles` | List and get roles |
| `create:roles` | Create roles |
| `read:organizations` | List and get organizations |
| `create:organizations` | Create organizations |

The full scope list mirrors Auth0's Management API scopes.

## Tenant Isolation

Every Management API request is scoped to a single tenant. The tenant is determined from the request context (domain, token claims, or path). A management token for Tenant A cannot access Tenant B's resources.

## Best Practices

- Use **separate management clients** for different services (admin UI, background jobs, etc.)
- Request **minimum scopes** needed for each client
- **Rotate client secrets** periodically
- **Audit management API access** through the logs system
