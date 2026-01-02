---
title: Security Model
description: Learn about AuthHero's security model including resource servers, scopes, roles, permissions, and organizations for fine-grained access control using RBAC.
---

# Security Model

AuthHero provides a comprehensive security model for controlling access to your APIs and resources. This document explains the key components and how they work together.

## Overview

AuthHero's security model is built on several key concepts:

- **Resource Servers** - Represent your APIs and define available scopes
- **Scopes** - Define what actions can be performed
- **Roles** - Groups of permissions that can be assigned to users
- **Permissions** - Specific scopes granted to users or roles
- **Organizations** - Logical groupings of users with isolated permissions

These components work together to provide fine-grained access control using Role-Based Access Control (RBAC).

## Resource Servers

Resource Servers (also called APIs) represent the APIs in your system that you want to protect. Each resource server has:

### Identifier (Audience)

A unique identifier, typically a URL, that identifies your API:

```json
{
  "identifier": "https://api.example.com"
}
```

When requesting an access token, clients specify which API they want to access using the `audience` parameter. This identifier appears in the `aud` claim of the access token.

### Scopes

Scopes define the available permissions for the API:

```json
{
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "read:users", "description": "Read user data" },
    { "value": "write:users", "description": "Modify user data" },
    { "value": "delete:users", "description": "Delete users" },
    { "value": "impersonate", "description": "Impersonate other users" }
  ]
}
```

### RBAC Configuration

Control whether to enforce permission checks:

```json
{
  "options": {
    "enforce_policies": true,
    "token_dialect": "access_token"
  }
}
```

**Options:**
- `enforce_policies` - When `true`, enables RBAC and enforces permission checks
- `token_dialect` - Controls how permissions appear in tokens:
  - `access_token` - Permissions appear as scopes
  - `access_token_authz` - Permissions appear in separate `permissions` array

[Learn more about Resource Servers API →](/api/endpoints#resource-servers)

## Scopes

Scopes are strings that represent specific permissions or actions. There are two types:

### OIDC Scopes

Standard OpenID Connect scopes for identity information:

| Scope | Description | Claims Returned |
|-------|-------------|-----------------|
| `openid` | Required for OIDC | `sub` (user identifier) |
| `profile` | User profile information | `name`, `given_name`, `family_name`, `nickname`, `picture`, `locale`, `updated_at` |
| `email` | Email address | `email`, `email_verified` |
| `address` | Postal address | `address` |
| `phone` | Phone number | `phone_number`, `phone_number_verified` |

These scopes are always available and don't need to be defined on resource servers.

### Custom API Scopes

Application-specific permissions defined on your resource servers:

```
read:users      # Read user data
write:users     # Create or update users
delete:users    # Delete users
impersonate     # Impersonate other users
read:posts      # Read blog posts
publish:posts   # Publish blog posts
```

**Naming Convention:**

Follow the pattern `action:resource` for clarity:
- `read:resource`
- `write:resource`
- `delete:resource`
- `admin:resource`

### Scope Behavior with RBAC

How scopes are granted depends on whether RBAC is enabled:

#### RBAC Disabled (`enforce_policies: false`)

All requested scopes are granted without permission checks:

```
Request:  openid read:users write:users admin:all
Granted:  openid read:users write:users admin:all ✓
```

#### RBAC Enabled (`enforce_policies: true`)

Scopes are granted based on these rules:

| Scope Type | Behavior |
|------------|----------|
| **OIDC scopes** | Always granted |
| **Scopes defined on resource server** | Only granted if user has permission |
| **Scopes NOT defined on resource server** | Always granted (pass through) |

**Example with restricted scope:**

```json
// Resource Server defines only sensitive scopes
{
  "scopes": [
    { "value": "impersonate", "description": "Restricted - impersonate users" }
  ],
  "options": { "enforce_policies": true }
}
```

**User WITHOUT permission:**
```
Request:  openid impersonate entitlement
Granted:  openid entitlement
          ✓ openid - OIDC scope
          ✗ impersonate - defined but no permission
          ✓ entitlement - not defined, passes through
```

**User WITH permission:**
```
Request:  openid impersonate entitlement  
Granted:  openid impersonate entitlement
          ✓ openid - OIDC scope
          ✓ impersonate - defined and has permission
          ✓ entitlement - not defined, passes through
```

This design allows you to:
- Define only sensitive scopes that need restriction
- Let general-purpose scopes pass through without explicit management
- Mix controlled and uncontrolled scopes in the same API

[Learn more about RBAC and Scopes →](/guides/rbac-and-scopes)

## Roles

Roles are named collections of permissions that can be assigned to users. They simplify permission management by grouping related permissions together.

### Creating Roles

```http
POST /api/v2/roles
{
  "name": "Content Editor",
  "description": "Can create and edit content"
}
```

### Assigning Permissions to Roles

```http
POST /api/v2/roles/{roleId}/permissions
{
  "permissions": [
    {
      "resource_server_identifier": "https://api.example.com",
      "permission_name": "read:posts"
    },
    {
      "resource_server_identifier": "https://api.example.com",
      "permission_name": "write:posts"
    }
  ]
}
```

### Assigning Roles to Users

```http
POST /api/v2/users/{userId}/roles
{
  "roles": ["{roleId}"]
}
```

### Organization-Specific Roles

Roles can be assigned globally or within a specific organization:

```http
POST /api/v2/organizations/{orgId}/members/{userId}/roles
{
  "roles": ["{roleId}"]
}
```

When a role is assigned within an organization:
- The user only has those permissions when accessing resources as a member of that organization
- The same user might have different roles in different organizations
- Access tokens include the organization ID when organization context is used

[Learn more about Roles API →](/api/endpoints#roles)

## Permissions

Permissions are specific scopes granted to users, either directly or through roles.

### Direct User Permissions

Assign permissions directly to a user:

```http
POST /api/v2/users/{userId}/permissions
{
  "permissions": [
    {
      "resource_server_identifier": "https://api.example.com",
      "permission_name": "impersonate"
    }
  ]
}
```

### Permission Resolution

When generating an access token, AuthHero combines permissions from multiple sources:

1. **Direct user permissions** - Permissions assigned directly to the user
2. **Global role permissions** - Permissions from roles assigned to the user globally
3. **Organization role permissions** - Permissions from roles assigned to the user within the organization (if organization context is present)

The final set of permissions is the union of all these sources.

### Token Claims

Depending on the token dialect, permissions appear differently:

**`access_token` dialect:**
```json
{
  "aud": "https://api.example.com",
  "scope": "openid read:users write:users",
  "sub": "auth0|user123"
}
```

**`access_token_authz` dialect:**
```json
{
  "aud": "https://api.example.com",
  "scope": "openid",
  "permissions": ["read:users", "write:users"],
  "sub": "auth0|user123"
}
```

[Learn more about Permissions API →](/api/endpoints#permissions)

## Organizations

Organizations enable you to group users and apply specific configurations, branding, and access controls to them. Organizations are essential for B2B applications serving multiple customer companies.

### Organization Context

When a user authenticates with an organization context:

```http
GET /authorize?
  client_id=...&
  organization=org_abc123&
  ...
```

The resulting access token includes:

```json
{
  "aud": "https://api.example.com",
  "scope": "read:users write:users",
  "sub": "auth0|user123",
  "org_id": "org_abc123"
}
```

### Organization Membership

Users must be members of an organization to access it:

```http
POST /api/v2/organizations/{orgId}/members
{
  "members": ["auth0|user123"]
}
```

If a non-member tries to authenticate with an organization, they receive a 403 error.

### Organization-Scoped Permissions

Permissions can be assigned within an organization context:

```http
POST /api/v2/organizations/{orgId}/members/{userId}/roles
{
  "roles": ["{roleId}"]
}
```

These permissions only apply when:
- The user authenticates with that organization's context
- The access token includes the `org_id` claim

### Use Cases

**Multi-tenant SaaS:**
```
Organization: Acme Corp
├── Users: alice@acme.com, bob@acme.com
├── Roles: Admin, Member
└── Permissions: Full access to Acme's data

Organization: Widget Inc  
├── Users: carol@widget.com, bob@acme.com (same user, different org)
├── Roles: Viewer
└── Permissions: Read-only access to Widget's data
```

**B2B Platform:**
```
Organization: Customer A
├── Custom branding
├── SSO via SAML
├── Admin: john@customer-a.com
└── Members: team@customer-a.com

Organization: Customer B
├── Custom branding
├── Username/password
├── Admin: jane@customer-b.com
└── Members: staff@customer-b.com
```

[Learn more about Organizations →](/concepts#organizations)

## Security Best Practices

### 1. Define Only Restricted Scopes

Only define scopes on your resource server that need RBAC enforcement:

```json
{
  "scopes": [
    { "value": "impersonate", "description": "High-risk: impersonate users" },
    { "value": "admin:billing", "description": "High-risk: manage billing" }
  ]
}
```

Let general-purpose scopes pass through without defining them.

### 2. Use Roles for Permission Management

Instead of assigning permissions directly to each user:

```
❌ Direct: Assign read:users, write:users to each admin user
✓  Roles: Create "Admin" role with permissions, assign role to users
```

### 3. Principle of Least Privilege

Grant users only the minimum permissions needed:

```
Standard User → read:users
Support Agent → read:users, read:tickets
Administrator → read:users, write:users, read:tickets, write:tickets
Super Admin   → All permissions + impersonate
```

### 4. Use Organization Context for Multi-Tenancy

Always include the organization parameter for B2B applications:

```javascript
// ✓ Correct - includes organization
await auth0.loginWithRedirect({
  authorizationParams: {
    organization: user.selectedOrganization,
    audience: 'https://api.example.com'
  }
});
```

### 5. Validate Organization in Your API

Always verify the `org_id` claim matches the requested resource:

```javascript
// Verify user can access this organization's data
if (token.org_id !== resource.organizationId) {
  throw new ForbiddenError('Access denied to this organization');
}
```

### 6. Audit Permission Changes

Log when permissions, roles, or organization memberships change:

```
[AUDIT] Admin user@example.com granted impersonate permission to admin@acme.com
[AUDIT] User bob@example.com added to organization org_abc123
[AUDIT] Role "Admin" updated with new permission delete:users
```

### 7. Regular Permission Reviews

Periodically review:
- Who has sensitive permissions like `impersonate`
- Unused roles that can be deleted
- Users with excessive permissions
- Organization memberships that may be outdated

### 8. Token Expiration

Configure appropriate token lifetimes:

```json
{
  "token_lifetime": 86400,        // 24 hours for regular access tokens
  "token_lifetime_for_web": 7200  // 2 hours for browser-based apps
}
```

Use refresh tokens for long-lived sessions instead of long-lived access tokens.

## Examples

### Example 1: Public API with Restricted Admin

```json
// Resource Server
{
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "admin:all", "description": "Full admin access" }
  ],
  "options": {
    "enforce_policies": true
  }
}
```

- Regular users can request any scope except `admin:all`
- Only users with `admin:all` permission get that scope
- `read:users`, `write:posts`, etc. pass through for all users

### Example 2: Fully Restricted API

```json
// Resource Server
{
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "read:users", "description": "Read users" },
    { "value": "write:users", "description": "Write users" },
    { "value": "delete:users", "description": "Delete users" }
  ],
  "options": {
    "enforce_policies": true
  }
}
```

- All API scopes are restricted
- Users only get scopes they have permission for
- OIDC scopes still pass through

### Example 3: Multi-Tenant with Organizations

```javascript
// User authenticates to Organization A
const tokenA = {
  aud: 'https://api.example.com',
  scope: 'openid read:users',
  sub: 'auth0|user123',
  org_id: 'org_a'
};

// Same user authenticates to Organization B with different role
const tokenB = {
  aud: 'https://api.example.com', 
  scope: 'openid read:users write:users admin:all',
  sub: 'auth0|user123',
  org_id: 'org_b'
};
```

Same user, different permissions based on organization context.

## Related Documentation

- [RBAC and Scopes Guide](/guides/rbac-and-scopes) - Detailed guide with examples
- [API Endpoints - Resource Servers](/api/endpoints#resource-servers)
- [API Endpoints - Roles](/api/endpoints#roles)  
- [API Endpoints - Permissions](/api/endpoints#permissions)
- [API Endpoints - Organizations](/api/endpoints#organizations)
- [Concepts - Organizations](/concepts#organizations)
