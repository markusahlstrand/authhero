---
title: RBAC, Scopes & Permissions
description: How role-based access control works in AuthHero — resource servers, scopes, roles, and permission resolution.
---

# RBAC, Scopes & Permissions

AuthHero provides Role-Based Access Control (RBAC) through resource servers, scopes, roles, and permissions. This model is compatible with Auth0's RBAC system.

## Resource Servers

Resource servers represent your APIs. Each defines an identifier (audience) and the scopes available:

```json
{
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "read:users", "description": "Read user data" },
    { "value": "write:users", "description": "Modify user data" },
    { "value": "impersonate", "description": "Impersonate other users" }
  ],
  "options": {
    "enforce_policies": true,
    "token_dialect": "access_token"
  }
}
```

### RBAC Configuration

- `enforce_policies: true` — Enables RBAC; only granted scopes appear in tokens
- `enforce_policies: false` — All requested scopes are granted without checks
- `token_dialect: "access_token"` — Permissions appear as scopes
- `token_dialect: "access_token_authz"` — Permissions appear in a separate `permissions` array

## Scopes

There are two types of scopes:

### OIDC Scopes (Always Granted)

| Scope | Claims Returned |
|-------|----------------|
| `openid` | `sub` |
| `profile` | `name`, `given_name`, `family_name`, `nickname`, `picture` |
| `email` | `email`, `email_verified` |

### Custom API Scopes

Defined on resource servers. Follow the `action:resource` convention:

```
read:users
write:users
delete:users
admin:billing
```

### Scope Behavior with RBAC Enabled

| Scope Type | Behavior |
|------------|----------|
| OIDC scopes | Always granted |
| Defined on resource server | Only granted if user has permission |
| NOT defined on resource server | Always granted (pass-through) |

This lets you define only the sensitive scopes that need restriction while letting general-purpose scopes pass through.

## Roles

Roles group permissions. Assign roles to users globally or per-organization:

```http
POST /api/v2/roles
{ "name": "Editor", "description": "Can edit content" }

POST /api/v2/roles/{roleId}/permissions
{ "permissions": [
    { "resource_server_identifier": "https://api.example.com", "permission_name": "read:posts" },
    { "resource_server_identifier": "https://api.example.com", "permission_name": "write:posts" }
] }

POST /api/v2/users/{userId}/roles
{ "roles": ["{roleId}"] }
```

### Organization-Specific Roles

```http
POST /api/v2/organizations/{orgId}/members/{userId}/roles
{ "roles": ["{roleId}"] }
```

These permissions only apply when the user authenticates with that organization's context.

## Permission Resolution

When generating an access token, permissions are resolved from:

1. **Direct user permissions**
2. **Global role permissions**
3. **Organization role permissions** (if org context present)

The final token contains the union of all sources.

## Best Practices

1. **Define only restricted scopes** — Only scopes needing RBAC enforcement need to be on the resource server
2. **Use roles, not direct permissions** — Easier to manage at scale
3. **Principle of least privilege** — Grant minimum needed permissions
4. **Use organization context for B2B** — Always include `organization` parameter
5. **Validate `org_id` in your API** — Verify the claim matches the requested resource
