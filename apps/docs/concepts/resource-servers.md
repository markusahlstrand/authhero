---
title: Resource Servers
description: Protect your APIs with AuthHero resource servers. Define scopes, configure RBAC, and control access through roles and permissions.
---

# Resource Servers

Resource Servers (also called APIs) represent protected APIs in your system. They define the scopes (permissions) available for your API and control access through Role-Based Access Control (RBAC).

## What is a Resource Server?

A resource server defines an API that you want to protect with AuthHero. When clients request access tokens, they specify which resource server they want to access, and AuthHero includes the appropriate scopes in the access token.

## Resource Server Properties

- **identifier**: Unique identifier for the API (typically a URL like `https://api.example.com`)
- **name**: Human-readable name
- **scopes**: Array of permission scopes defined for this API
- **signing_alg**: Algorithm used to sign tokens (RS256, HS256)
- **token_lifetime**: How long access tokens are valid (in seconds)

## Scopes

Scopes define granular permissions within your API:

```typescript
{
  "identifier": "https://api.example.com",
  "name": "My API",
  "scopes": [
    { "value": "read:users", "description": "Read user data" },
    { "value": "write:users", "description": "Create and update users" },
    { "value": "delete:users", "description": "Delete users" },
    { "value": "read:orders", "description": "Read orders" },
    { "value": "write:orders", "description": "Create and update orders" }
  ]
}
```

## Roles and Permissions

Roles group scopes together for easier assignment to users:

```typescript
// Define a role
{
  "name": "User Manager",
  "description": "Can manage users",
  "permissions": [
    { "resource_server_identifier": "https://api.example.com", "permission_name": "read:users" },
    { "resource_server_identifier": "https://api.example.com", "permission_name": "write:users" }
  ]
}

// Assign role to user
POST /api/v2/users/{user_id}/roles
{
  "roles": ["rol_abc123"]
}
```

When the user authenticates, their access token will include the scopes from all their assigned roles.

## Access Token Example

```json
{
  "iss": "https://auth.example.com/",
  "sub": "auth0|user123",
  "aud": ["https://api.example.com"],
  "exp": 1735894800,
  "scope": "read:users write:users",
  "permissions": ["read:users", "write:users"]
}
```

Your API validates this token and checks the `permissions` claim to enforce authorization.

## RBAC in Organizations

Resource servers and roles can be scoped to organizations, allowing different permissions for users in different organizational contexts.

See [Security Model](/security-model) and [Organizations](/concepts/organizations) for more details.

## API Reference

- [GET /api/v2/resource-servers](/api/endpoints#get-resource-servers)
- [POST /api/v2/resource-servers](/api/endpoints#create-resource-server)
- [PATCH /api/v2/resource-servers/:id](/api/endpoints#update-resource-server)
- [DELETE /api/v2/resource-servers/:id](/api/endpoints#delete-resource-server)
- [GET /api/v2/roles](/api/endpoints#get-roles)
- [POST /api/v2/roles](/api/endpoints#create-role)
