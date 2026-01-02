---
title: RBAC and Scopes Guide
description: Detailed guide to implementing Role-Based Access Control in AuthHero including resource servers, scope behavior with RBAC enabled/disabled, and examples.
---

# Role-Based Access Control (RBAC) and Scopes

This guide provides detailed examples and use cases for implementing Role-Based Access Control (RBAC) in AuthHero. For a comprehensive overview of the security model, see the [Security Model](/security-model) documentation.

## Quick Overview

AuthHero uses **Resource Servers** (APIs) to define available scopes, and **RBAC** to control which users receive those scopes in their access tokens.

**Key insight:** When RBAC is enabled, only scopes *defined* on your resource server are restricted. Scopes *not defined* pass through freely, giving you flexibility to mix controlled and uncontrolled access.

[Learn about Resource Servers, Roles, and Permissions →](/security-model)

## Scope Behavior

The way scopes are handled depends on whether RBAC is enabled for your Resource Server:

### When RBAC is Disabled

When `enforce_policies: false` (or not set), **all requested scopes are granted**. No permission checks are performed.

```json
// Resource Server with RBAC disabled
{
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "read:users", "description": "Read users" },
    { "value": "write:users", "description": "Write users" }
  ],
  "options": {
    "enforce_policies": false
  }
}
```

**Behavior:**
- User requests: `openid read:users write:users custom:scope`
- User receives: `openid read:users write:users custom:scope` ✓

All scopes are granted, even those not defined on the resource server.

### When RBAC is Enabled

When `enforce_policies: true`, scopes are granted based on the following rules:

| Scope Type | Behavior |
|------------|----------|
| **OIDC scopes** (`openid`, `profile`, `email`, etc.) | Always granted |
| **Scopes defined on resource server** | Only granted if user has the permission |
| **Scopes NOT defined on resource server** | Always granted (pass through) |

```json
// Resource Server with RBAC enabled
{
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "impersonate", "description": "Impersonate users - restricted" }
  ],
  "options": {
    "enforce_policies": true,
    "token_dialect": "access_token"
  }
}
```

#### Example: User Without Permission

**User permissions:** None

**Request scopes:** `openid impersonate entitlement`

**Granted scopes:** `openid entitlement`

- ✓ `openid` - OIDC scope, always allowed
- ✗ `impersonate` - Defined on resource server, but user lacks permission
- ✓ `entitlement` - Not defined on resource server, passes through

#### Example: User With Permission

**User permissions:** `impersonate` (assigned via role or direct permission)

**Request scopes:** `openid impersonate entitlement`

**Granted scopes:** `openid impersonate entitlement`

- ✓ `openid` - OIDC scope, always allowed
- ✓ `impersonate` - Defined on resource server AND user has permission
- ✓ `entitlement` - Not defined on resource server, passes through

## Use Cases

### Use Case 1: Unrestricted API

For internal APIs or development, you may want to allow any scope without permission checks:

```json
{
  "identifier": "https://internal-api.example.com",
  "scopes": [],
  "options": {
    "enforce_policies": false
  }
}
```

All requested scopes will be granted.

### Use Case 2: Restrict Sensitive Operations

For production APIs with sensitive operations, define restricted scopes and enable RBAC:

```json
{
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "read:users", "description": "Read user data" },
    { "value": "write:users", "description": "Modify user data" },
    { "value": "delete:users", "description": "Delete users" },
    { "value": "impersonate", "description": "Impersonate users" }
  ],
  "options": {
    "enforce_policies": true,
    "token_dialect": "access_token"
  }
}
```

Then assign permissions to users:
- Regular users get `read:users`
- Admins get `read:users`, `write:users`, `delete:users`
- Super admins get all scopes including `impersonate`

### Use Case 3: Mixed Restricted and Unrestricted Scopes

You can combine restricted scopes with pass-through scopes by only defining the restricted ones:

```json
{
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "impersonate", "description": "Impersonate users - RESTRICTED" }
  ],
  "options": {
    "enforce_policies": true
  }
}
```

- `impersonate` - Only granted to users with permission
- `entitlement`, `custom:feature`, etc. - Pass through for all users

This is ideal when you have:
- A few sensitive operations that need access control
- Many general scopes that all users should access

## Token Dialects

When RBAC is enabled, you can choose how permissions appear in tokens:

### `access_token` (Default)

Permissions are represented as scopes:

```json
{
  "aud": "https://api.example.com",
  "scope": "openid read:users write:users",
  "sub": "auth0|user123",
  ...
}
```

### `access_token_authz`

Permissions appear in a separate `permissions` array, scopes only include OIDC scopes:

```json
{
  "aud": "https://api.example.com",
  "scope": "openid",
  "permissions": ["read:users", "write:users"],
  "sub": "auth0|user123",
  ...
}
```

This is useful when your API needs to distinguish between requested scopes and granted permissions.

## Assigning Permissions

### Direct User Permissions

Assign permissions directly to a user:

```http
POST /api/v2/users/{userId}/permissions
{
  "permissions": [
    {
      "resource_server_identifier": "https://api.example.com",
      "permission_name": "read:users"
    }
  ]
}
```

### Role-Based Permissions

Create a role with permissions:

```http
POST /api/v2/roles
{
  "name": "Admin",
  "description": "Administrator role"
}

POST /api/v2/roles/{roleId}/permissions
{
  "permissions": [
    {
      "resource_server_identifier": "https://api.example.com",
      "permission_name": "read:users"
    },
    {
      "resource_server_identifier": "https://api.example.com",
      "permission_name": "write:users"
    }
  ]
}
```

Then assign the role to users:

```http
POST /api/v2/users/{userId}/roles
{
  "roles": ["{roleId}"]
}
```

## Refresh Tokens and Scopes

When a refresh token is exchanged for a new access token, the scopes stored in the refresh token are used as the requested scopes. The same RBAC rules apply:

1. If RBAC is disabled: All scopes from the refresh token are granted
2. If RBAC is enabled: Scopes are re-evaluated based on current user permissions

This means if you revoke a user's permission, they won't get that scope even when using a valid refresh token.

## Best Practices

1. **Define only restricted scopes** - Don't define scopes on your resource server unless you want to restrict them with RBAC

2. **Use roles for permission management** - Easier to manage than direct user permissions

3. **Enable RBAC for production APIs** - Even if you start with RBAC disabled, plan for enabling it later

4. **Use descriptive scope names** - Follow the pattern `action:resource` (e.g., `read:users`, `write:posts`)

5. **Document your scopes** - Use the `description` field to explain what each scope grants

6. **Audit scope usage** - Check your logs to see which scopes are being requested and granted

## Migration from Auth0

AuthHero's RBAC implementation is compatible with Auth0's behavior when `enforce_policies` is enabled. However, there's one key difference:

**Scopes not defined on the resource server:**
- Auth0: Behavior varies depending on settings
- AuthHero: Always pass through (granted) when RBAC is enabled

This makes AuthHero more flexible for mixed scenarios where you want some scopes restricted and others unrestricted.

## Related Documentation

- [Security Model](/security-model) - Comprehensive overview of Resource Servers, Scopes, Roles, Permissions, and Organizations
- [API Endpoints - Resource Servers](/api/endpoints#resource-servers)
- [API Endpoints - Permissions](/api/endpoints#permissions)
- [API Endpoints - Roles](/api/endpoints#roles)
- [Hooks - Modifying Access Tokens](/auth0-comparison/hooks#credential-exchange)
