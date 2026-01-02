---
title: Control Plane Architecture
description: Central management layer for multi-tenant AuthHero. Entity synchronization, organization mapping, and access control via the control plane.
---

# Control Plane Architecture

The multi-tenancy package uses a **control plane** architecture where a central tenant manages and provisions all other tenants in the system.

## Overview

The control plane acts as the management layer for your entire multi-tenant system:

- **Centralized Management**: All tenant management operations happen on the control plane
- **Entity Synchronization**: Resource servers and roles from the control plane are synced to child tenants
- **Organization Mapping**: Organizations on the control plane map to individual child tenants
- **Access Control**: Controls who can access which tenants via organization membership

## Control Plane vs Child Tenants

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CONTROL PLANE (main)                              │
│                                                                          │
│  Organizations                   System Entities                        │
│  ┌──────────────┐               ┌──────────────────┐                   │
│  │ org: "acme"  │               │ Resource Servers │                   │
│  │ users:       │               │  - Management API│                   │
│  │  - alice     │               │  - My API        │                   │
│  │  - bob       │               │                  │                   │
│  └──────────────┘               │ Roles            │                   │
│                                 │  - Admin         │                   │
│  ┌──────────────┐               │  - User          │                   │
│  │ org:"widgets"│               │  - Viewer        │                   │
│  │ users:       │               └──────────────────┘                   │
│  │  - charlie   │                                                       │
│  └──────────────┘                                                       │
│                                                                          │
└──────────────────┬─────────────────────────────────┬─────────────────────┘
                   │ Synced Entities                 │
                   ▼                                 ▼
        ┌──────────────────┐              ┌──────────────────┐
        │ TENANT: acme     │              │ TENANT: widgets  │
        │                  │              │                  │
        │ Organizations    │              │ Organizations    │
        │  - Sales Dept    │              │  - Engineering   │
        │  - Marketing     │              │  - Product       │
        │                  │              │                  │
        │ Resource Servers │              │ Resource Servers │
        │  - Management API│ (synced)     │  - Management API│ (synced)
        │  - My API        │ (synced)     │  - My API        │ (synced)
        │                  │              │                  │
        │ Roles            │              │ Roles            │
        │  - Admin         │ (synced)     │  - Admin         │ (synced)
        │  - User          │ (synced)     │  - User          │ (synced)
        │  - Viewer        │ (synced)     │  - Viewer        │ (synced)
        │                  │              │                  │
        │ Users            │              │ Users            │
        │  - end-user-1    │              │  - end-user-2    │
        │  - end-user-2    │              │  - end-user-3    │
        └──────────────────┘              └──────────────────┘
```

### Key Differences

| Aspect | Control Plane | Child Tenants |
|--------|--------------|---------------|
| **Purpose** | Manages all tenants | Isolated customer environments |
| **Organizations** | Map to child tenants | Internal business units |
| **Users on Orgs** | Tenant administrators | Not used for tenant access |
| **Resource Servers** | Synced to all tenants | Synced from control plane |
| **Roles** | Synced to all tenants | Synced from control plane |
| **End Users** | System administrators | Customer end users |

## Entity Synchronization

When you create or update entities on the control plane, they are automatically synchronized to all child tenants.

### Synced Entities

#### 1. Resource Servers

Resource servers created on the control plane are automatically synced to all child tenants with the `is_system: true` flag.

```typescript
// Create a resource server on control plane
await adapters.resourceServers.create("main", {
  name: "My API",
  identifier: "https://api.example.com",
  scopes: [
    { value: "read:data", description: "Read data" },
    { value: "write:data", description: "Write data" },
  ],
});

// Automatically synced to all child tenants:
// - tenant: acme
// - tenant: widgets
// - tenant: demo
// All with is_system: true
```

**Key Points:**
- Marked as `is_system: true` on child tenants
- Cannot be modified on child tenants
- Updates on control plane are synced to all tenants
- Deletions on control plane remove from all tenants

#### 2. Roles

Roles created on the control plane are automatically synced to all child tenants.

```typescript
// Create a role on control plane
await adapters.roles.create("main", {
  name: "Admin",
  description: "Administrator role",
});

// Automatically synced to all child tenants with is_system: true
```

**Key Points:**
- Marked as `is_system: true` on child tenants
- Cannot be modified on child tenants
- Role permissions are also synced
- Updates and deletions are propagated

#### 3. Role Permissions

When roles are synced, their permissions are also synchronized.

```typescript
// Assign permissions on control plane
await adapters.rolePermissions.assign("main", adminRoleId, [
  {
    role_id: adminRoleId,
    resource_server_identifier: "https://api.example.com",
    permission_name: "read:data",
  },
]);

// Permissions are synced to the same role on all child tenants
```

### Configuration

Enable entity synchronization when setting up multi-tenancy:

```typescript
import {
  setupMultiTenancy,
  createTenantResourceServerSyncHooks,
  createTenantRoleSyncHooks,
} from "@authhero/multi-tenancy";

// Create sync hooks
const resourceServerSync = createTenantResourceServerSyncHooks({
  controlPlaneTenantId: "main",
  getControlPlaneAdapters: async () => mainAdapters,
  getAdapters: async (tenantId) => getTenantAdapters(tenantId),
});

const roleSync = createTenantRoleSyncHooks({
  controlPlaneTenantId: "main",
  getControlPlaneAdapters: async () => mainAdapters,
  getAdapters: async (tenantId) => getTenantAdapters(tenantId),
  syncPermissions: true, // Also sync role permissions
});

// Setup multi-tenancy with sync hooks
const multiTenancy = setupMultiTenancy({
  accessControl: {
    controlPlaneTenantId: "main",
  },
  hooks: {
    resourceServers: resourceServerSync,
    roles: roleSync,
  },
});
```

### Protected Entities Middleware

System entities synced from the control plane are protected from modification on child tenants:

```typescript
import { createProtectSyncedMiddleware } from "@authhero/multi-tenancy";

// Apply middleware to management API
app.use("/api/v2/*", createProtectSyncedMiddleware());

// Now attempts to modify synced entities will return 403
// PATCH /api/v2/resource-servers/:id (where is_system: true)
// Response: 403 "This resource server is a system resource and cannot be modified"
```

## Organizations: Control Plane vs Child Tenants

Organizations serve different purposes depending on where they exist:

### Organizations on Control Plane

Organizations on the control plane represent **child tenants**:

```typescript
// Create a new tenant
await fetch("/management/tenants", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    id: "acme",
    friendly_name: "Acme Corporation",
  }),
});

// This automatically creates:
// 1. Tenant with id "acme"
// 2. Organization on control plane with name "acme"
```

**Key characteristics:**
- Organization name = tenant ID
- Membership controls tenant administrator access
- Used for access control to tenant management APIs

**Example use case:**
```typescript
// Alice is added to the "acme" organization on control plane
// This grants her access to manage the acme tenant via:
// - Token with org_name: "acme" or organization_id: "acme"
// - Can call management APIs for acme tenant
```

### Organizations on Child Tenants

Organizations on child tenants represent **internal business units** within that tenant:

```typescript
// On the "acme" tenant, create departments
await adapters.organizations.create("acme", {
  name: "sales-dept",
  display_name: "Sales Department",
});

await adapters.organizations.create("acme", {
  name: "engineering",
  display_name: "Engineering Department",
});
```

**Key characteristics:**
- Represent departments, teams, or business units
- Used for B2B customer organization management
- Not used for tenant access control
- End users belong to these organizations

**Example use case:**
```typescript
// Acme Corporation has two departments:
// 1. Sales Department - has access to CRM features
// 2. Engineering - has access to technical resources
// End users get tokens with org_id for their department
```

## API Access Methods

There are three ways to call tenant-scoped APIs:

### 1. Organization Token (Recommended)

Request a token with an organization claim via silent authentication:

```typescript
// Get token for "acme" tenant
const token = await auth.getTokenSilently({
  authorizationParams: {
    organization: "acme",
  },
});

// Call any API for acme tenant
const response = await fetch("https://api.example.com/api/v2/users", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// Token contains org_name: "acme" or organization_id: "org_xxx"
// Middleware automatically routes to acme tenant
```

**How it works:**
- Token includes `org_name: "acme"` (if `allow_organization_name_in_authentication_api` is enabled)
- Or `organization_id: "org_xxx"` where org.name = "acme"
- Access control middleware validates organization membership on control plane
- Request is automatically scoped to the acme tenant

**Best for:**
- Production applications
- Frontend/mobile apps
- Standard OAuth2/OIDC flows

### 2. Control Plane Token + Tenant Header

Use a control plane token with an explicit tenant ID header:

```typescript
// Get control plane token (no organization)
const token = await auth.getTokenSilently();

// Call API with tenant header
const response = await fetch("https://api.example.com/api/v2/users", {
  headers: {
    Authorization: `Bearer ${token}`,
    "X-Tenant-ID": "acme", // or "tenant-id": "acme"
  },
});
```

**How it works:**
- Token is for control plane (no org_id)
- Tenant header explicitly specifies target tenant
- Access control validates user has access to specified tenant
- Request is scoped to the tenant from header

**Best for:**
- Administrative scripts
- Backend services
- Migration tools
- Testing scenarios

### 3. Tenant-Specific Token

Request a token directly from a tenant's authorization endpoint:

```typescript
// Login directly to acme tenant
const token = await fetch("https://acme.auth.example.com/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "password",
    username: "user@acme.com",
    password: "password",
    client_id: "client_id",
    scope: "openid profile",
  }),
});

// Use token for acme tenant
const response = await fetch("https://acme.auth.example.com/api/v2/users", {
  headers: {
    Authorization: `Bearer ${token.access_token}`,
  },
});
```

**How it works:**
- Subdomain routing determines tenant (acme.auth.example.com → acme)
- Token is issued specifically for acme tenant
- No organization claim needed
- Request is automatically scoped via subdomain

**Best for:**
- Subdomain-based deployments
- Tenant-specific domains
- White-label scenarios
- Isolated tenant access

### Comparison Table

| Method | Token Type | Tenant Selection | Use Case |
|--------|-----------|------------------|----------|
| **Organization Token** | Control plane with org claim | Via `org_name`/`organization_id` | Production apps, standard OAuth flow |
| **Token + Header** | Control plane | Via `X-Tenant-ID` header | Admin tools, backend services |
| **Tenant Token** | Tenant-specific | Via subdomain | White-label, isolated deployments |

## Access Control Flow

### Accessing Control Plane

```typescript
// User alice has no organization claim
const token = {
  sub: "alice",
  // No org_id or org_name
};

// ✅ Can access control plane
GET /management/tenants
Authorization: Bearer <token>

// ✅ Can list all tenants alice has access to
// (based on organization memberships on control plane)
```

### Accessing Child Tenant

```typescript
// User alice is member of "acme" organization on control plane
const token = {
  sub: "alice",
  org_name: "acme", // or organization_id: "org_xxx"
};

// ✅ Can access acme tenant
GET /api/v2/users
Authorization: Bearer <token>

// ❌ Cannot access widgets tenant
GET /api/v2/users
Authorization: Bearer <token>
X-Tenant-ID: widgets
// Response: 403 Forbidden
```

## Example: Complete Multi-Tenant Setup

```typescript
import { init } from "@authhero/authhero";
import { getAdapters } from "./adapters";

const app = await init({
  multiTenancy: {
    // Define control plane
    accessControl: {
      controlPlaneTenantId: "main",
      requireOrganizationMatch: true,
      defaultPermissions: ["tenant:admin"],
    },

    // Enable subdomain routing
    subdomainRouting: {
      baseDomain: "auth.example.com",
      reservedSubdomains: ["www", "api", "admin"],
    },

    // Sync entities from control plane
    entitySync: {
      resourceServers: true,
      roles: true,
      permissions: true,
    },

    // Database isolation per tenant
    databaseIsolation: {
      createDatabase: async (tenantId) => {
        // Create D1 database or Turso instance
        const db = await createTenantDatabase(tenantId);
        return getAdapters(db);
      },
      deleteDatabase: async (tenantId) => {
        await deleteTenantDatabase(tenantId);
      },
    },
  },

  // Your other config
  issuer: "https://auth.example.com/",
  getAdapters: () => getAdapters(mainDb),
});
```

## Best Practices

### 1. Use org_name for Tenant Access

Enable `allow_organization_name_in_authentication_api` on your applications:

```typescript
await adapters.clients.update("main", clientId, {
  allow_organization_name_in_authentication_api: true,
});
```

This ensures tokens contain `org_name` which directly maps to tenant IDs, avoiding the need to lookup organization IDs.

### 2. Protect System Entities

Always use the protect synced middleware:

```typescript
import { createProtectSyncedMiddleware } from "@authhero/multi-tenancy";

app.use("/api/v2/*", createProtectSyncedMiddleware());
```

### 3. Centralize Entity Management

Create all shared resource servers and roles on the control plane:

```typescript
// ✅ Create on control plane - syncs to all tenants
await createResourceServer("main", config);

// ❌ Don't create individually on each tenant
// await createResourceServer("acme", config);
// await createResourceServer("widgets", config);
```

### 4. Separate Admin and End Users

- **Control plane users**: Tenant administrators, manage via organizations
- **Child tenant users**: End customers, authenticate to their specific tenant

### 5. Use Tenant Headers for Admin Operations

For administrative scripts and backend services, use the control plane token with tenant headers rather than switching organizations:

```typescript
// ✅ Simple admin script
const adminToken = await getControlPlaneToken();

for (const tenant of tenants) {
  await fetch(`/api/v2/users`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "X-Tenant-ID": tenant.id,
    },
  });
}
```

## Next Steps

- [Tenant Lifecycle](./tenant-lifecycle.md) - Learn about creating and managing tenants
- [Database Isolation](./database-isolation.md) - Set up per-tenant databases
- [Settings Inheritance](./settings-inheritance.md) - Inherit configuration from control plane
- [API Reference](./api-reference.md) - Complete API documentation
