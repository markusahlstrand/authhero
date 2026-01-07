---
title: Multi-Tenancy Package
description: Complete multi-tenancy solution for AuthHero with organization-based access control, per-tenant database isolation, and subdomain routing.
---

# @authhero/multi-tenancy

Multi-tenancy support for AuthHero with organization-based access control, per-tenant database isolation, and subdomain routing.

## Overview

This package provides a complete multi-tenancy solution for AuthHero-based authentication systems. It enables you to:

- **Manage multiple tenants** from a central control plane
- **Control access** using organization-based tokens
- **Isolate data** with per-tenant databases (D1, Turso, or custom)
- **Route requests** via subdomains
- **Sync entities** from control plane to child tenants
- **Share secrets** via runtime fallback without copying sensitive data

::: tip Composable Architecture
This package uses a **peer dependency** on `authhero` (^3.0.0) and provides composable building blocks that integrate with AuthHero's hooks system. You import and use AuthHero's `init()` function directly, passing in multi-tenancy hooks and extensions.
:::

## Installation

```bash
pnpm add authhero @authhero/multi-tenancy
# or
npm install authhero @authhero/multi-tenancy
```

::: tip Peer Dependency
`@authhero/multi-tenancy` requires `authhero` as a peer dependency (^3.0.0). Both packages must be installed.
:::

## Quick Start

```typescript
import { initMultiTenant } from "@authhero/multi-tenancy";
import createAdapters from "@authhero/kysely-adapter";

const dataAdapter = createAdapters(db);

const { app } = initMultiTenant({
  dataAdapter,
  // That's it! Everything else has sensible defaults:
  // - controlPlaneTenantId: "control_plane"
  // - Resource servers, roles, and connections sync enabled
  // - Tenants API mounted at /tenants
  // - Protected synced entities middleware applied
});

export default app;
```

This sets up a complete multi-tenant system where:

- The `control_plane` tenant manages all other tenants
- Resource servers created on `control_plane` are automatically synced to all child tenants
- Roles created on `control_plane` are automatically synced to all child tenants
- Each tenant has isolated users, applications, and configuration

### Customization Options

```typescript
const { app } = initMultiTenant({
  dataAdapter,

  // Custom control plane tenant ID
  controlPlaneTenantId: "main",

  // Control which entities to sync
  sync: {
    resourceServers: true,
    roles: true,
    connections: false, // Don't sync connections
  },

  // Or disable syncing entirely - each tenant manages their own entities
  // sync: false,

  // Default permissions for new tenant organizations
  defaultPermissions: ["tenant:admin", "tenant:read"],

  // Custom database per tenant (for database isolation)
  getAdapters: async (tenantId) =>
    createAdapters(getDatabaseForTenant(tenantId)),

  // Pass through any AuthHero config options
  hooks: {
    onExecutePostLogin: async (event, api) => {
      /* ... */
    },
  },
});
```

### Advanced Setup

For more control over the setup, you can use the lower-level APIs directly:

```typescript
import { init, fetchAll } from "authhero";
import {
  createSyncHooks,
  createTenantsOpenAPIRouter,
  createProtectSyncedMiddleware,
} from "@authhero/multi-tenancy";
import createAdapters from "@authhero/kysely-adapter";

const CONTROL_PLANE_TENANT_ID = "control_plane";
const dataAdapter = createAdapters(db);

// Create sync hooks for syncing entities from control plane to child tenants
const { entityHooks, tenantHooks } = createSyncHooks({
  controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
  getChildTenantIds: async () => {
    const allTenants = await fetchAll(
      (params) => dataAdapter.tenants.list(params),
      "tenants",
      { cursorField: "id", pageSize: 100 },
    );
    return allTenants
      .filter((t) => t.id !== CONTROL_PLANE_TENANT_ID)
      .map((t) => t.id);
  },
  getAdapters: async () => dataAdapter,
  getControlPlaneAdapters: async () => dataAdapter,
  sync: {
    resourceServers: true,
    roles: true,
    connections: true,
  },
});

// Create tenants router
const tenantsRouter = createTenantsOpenAPIRouter(
  {
    accessControl: {
      controlPlaneTenantId: CONTROL_PLANE_TENANT_ID,
      requireOrganizationMatch: false,
      defaultPermissions: ["tenant:admin"],
    },
  },
  { tenants: tenantHooks },
);

// Initialize AuthHero with sync hooks and tenant routes
const { app } = init({
  dataAdapter,
  entityHooks,
  managementApiExtensions: [{ path: "/tenants", router: tenantsRouter }],
});

// Add middleware to protect synced entities
app.use("/api/v2/*", createProtectSyncedMiddleware());

export default app;
```

## Entity Synchronization

The multi-tenancy system automatically synchronizes specific entities from the control plane to all child tenants, ensuring consistency across your deployment.

### Synced Entities

When entity sync is enabled via `createSyncHooks`, the following happens automatically:

#### Resource Servers

Resource servers created on the control plane are synced to all child tenants:

```typescript
// On control_plane tenant
POST /api/v2/resource-servers
{
  "name": "My API",
  "identifier": "https://api.example.com",
  "scopes": [
    { "value": "read:data", "description": "Read data" },
    { "value": "write:data", "description": "Write data" }
  ]
}

// Automatically copied to ALL child tenants with:
// - Same identifier, name, and scopes
// - is_system: true (cannot be modified on child tenants)
// - Updates on control plane sync to all tenants
// - Deletions on control plane remove from all tenants
```

#### Roles

Roles created on the control plane are synced to all child tenants:

```typescript
// On control_plane tenant
POST /api/v2/roles
{
  "name": "Admin",
  "description": "Administrator role"
}

// Automatically copied to ALL child tenants with:
// - Same name and description
// - is_system: true (cannot be modified on child tenants)
// - Role permissions are also synced
```

#### Role Permissions

When you assign permissions to roles on the control plane, they sync too:

```typescript
// On control_plane tenant
POST /
  api /
  v2 /
  roles /
  { roleId } /
  permissions[
    {
      resource_server_identifier: "https://api.example.com",
      permission_name: "read:data",
    }
  ];

// These permissions are automatically assigned to the same role on all child tenants
```

### When Entities are Synced

Synchronization happens automatically at these times:

1. **On Entity Creation**: When you create a resource server or role on the control plane, it's immediately synced to all existing child tenants
2. **On Entity Update**: When you update a synced entity on the control plane, changes propagate to all child tenants
3. **On Entity Deletion**: When you delete a synced entity on the control plane, it's removed from all child tenants
4. **On Tenant Creation**: When you create a new child tenant, all existing control plane resource servers and roles are copied to it

### Protected Entities

Entities synced from the control plane are marked as `is_system: true` on child tenants and **cannot be modified directly**. Attempts to update or delete them on child tenants will fail:

```typescript
// On child tenant - this will fail
PATCH / api / v2 / resource - servers / { id }; // where is_system: true
// Response: 403 "This resource server is a system resource and cannot be modified"
```

To modify synced entities, update them on the control plane and changes will automatically propagate.

### Configuration Options

Control which entities to sync using the `sync` option in `createSyncHooks`:

```typescript
const { entityHooks, tenantHooks } = createSyncHooks({
  controlPlaneTenantId: "control_plane",
  getChildTenantIds: async () => {
    /* ... */
  },
  getAdapters: async () => dataAdapter,
  getControlPlaneAdapters: async () => dataAdapter,

  // Control which entities to sync (all default to true)
  sync: {
    resourceServers: true, // Sync resource servers
    roles: true, // Sync roles and permissions
    connections: true, // Sync connections (without secrets)
  },
});
```

Set any option to `false` to disable that type of synchronization if you want child tenants to manage their own entities independently.

## Documentation

- [Control Plane Architecture](./control-plane.md) - Control plane concept, entity sync, and API access methods
- [Runtime Fallback](./runtime-fallback.md) - Share connection secrets and settings without copying them
- [Architecture](./architecture.md) - Organization-tenant model and token-based access
- [Database Isolation](./database-isolation.md) - Per-tenant databases with D1, Turso, or custom
- [Tenant Lifecycle](./tenant-lifecycle.md) - Creating, managing, and deleting tenants
- [Subdomain Routing](./subdomain-routing.md) - Route requests based on subdomains
- [API Reference](./api-reference.md) - Complete API documentation
- [Migration Guide](./migration.md) - Moving from single to multi-tenant

## Key Concepts

### Control Plane Architecture

The multi-tenancy system uses a **control plane** architecture where a central tenant manages all other tenants:

- **Control Plane**: The central management tenant (default: `control_plane`) that manages all other tenants
- **Child Tenants**: Independent tenants with their own users, applications, and configuration
- **Entity Synchronization**: Resource servers and roles from the control plane are automatically synced to all child tenants
- **Organizations**: Organizations on the control plane represent child tenants and control access to them

When a new child tenant is created:

1. A tenant record is created in the database
2. An organization with the same ID is created on the control plane
3. All control plane resource servers are copied to the new tenant (if `sync.resourceServers: true`)
4. All control plane roles are copied to the new tenant (if `sync.roles: true`)
5. All control plane connections are copied to the new tenant without secrets (if `sync.connections: true`)
6. Users added to that organization on the control plane can manage the child tenant

### Token-Based Access Control

Access to tenants is controlled via the `org_name` or `organization_id` claim in JWT tokens:

- **No org claim**: Access to control plane only
- **With org claim**: Access to the tenant matching the organization

### Silent Authentication Flow

To switch between tenants, use **silent authentication** to request a new token with a different organization:

```typescript
// Get token for a specific tenant
const token = await getAccessTokenSilently({
  authorizationParams: {
    organization: "tenant-id",
  },
});
```

## Features

### 🔐 Access Control

- Organization-based tenant access
- JWT token validation with `org_id` claim
- Configurable default permissions and roles
- Automatic organization provisioning

### 💾 Database Isolation

- Per-tenant database instances
- Support for Cloudflare D1, Turso, and custom databases
- Automatic provisioning and deprovisioning
- Factory pattern for database creation

### ⚙️ Settings Inheritance

- Inherit settings from main tenant
- Selective key inheritance
- Transform settings before applying
- Override inherited settings per tenant

### 🌐 Subdomain Routing

- Automatic subdomain-to-tenant resolution
- Reserved subdomain handling
- Custom subdomain resolvers
- Organization-based routing

### 🔄 Tenant Lifecycle

- Automated tenant provisioning
- Organization synchronization
- Database initialization
- Cleanup on deletion

## Related Packages

- **[@authhero/cloudflare](../adapters/cloudflare.md)** - Cloudflare D1 database factory
- **[authhero](../authhero/)** - Core authentication library

## License

MIT
