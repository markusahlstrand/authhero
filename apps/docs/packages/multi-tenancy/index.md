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
- **Inherit settings** from the control plane to child tenants

## Installation

```bash
pnpm add @authhero/multi-tenancy
# or
npm install @authhero/multi-tenancy
```

## Quick Start

```typescript
import { init } from "@authhero/multi-tenancy";
import createAdapters from "@authhero/kysely-adapter";

// Create your data adapters (Kysely, Drizzle, etc.)
const dataAdapter = createAdapters(db);

// Initialize multi-tenant AuthHero with entity sync
const { app } = init({
  dataAdapter,
  // Control plane tenant manages all other tenants
  controlPlaneTenantId: "control_plane",
  // Sync resource servers from control plane to all child tenants
  syncResourceServers: true,
  // Sync roles from control plane to all child tenants
  syncRoles: true,
  // Additional AuthHero configuration
  emailProvider: myEmailProvider,
  smsProvider: mySmsProvider,
});

export default app;
```

This sets up a complete multi-tenant system where:

- The `control_plane` tenant manages all other tenants
- Resource servers created on `control_plane` are automatically synced to all child tenants
- Roles created on `control_plane` are automatically synced to all child tenants
- Each tenant has isolated users, applications, and configuration

## Entity Synchronization

The multi-tenancy system automatically synchronizes specific entities from the control plane to all child tenants, ensuring consistency across your deployment.

### Synced Entities

When `syncResourceServers` and `syncRoles` are enabled, the following happens automatically:

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

```typescript
const { app } = init({
  dataAdapter,
  controlPlaneTenantId: "control_plane",

  // Sync resource servers (default: true)
  syncResourceServers: true,

  // Sync roles and their permissions (default: true)
  syncRoles: true,
});
```

Set either option to `false` to disable that type of synchronization if you want child tenants to manage their own resource servers or roles independently.

## Documentation

- [Control Plane Architecture](./control-plane.md) - Control plane concept, entity sync, and API access methods
- [Architecture](./architecture.md) - Organization-tenant model and token-based access
- [Database Isolation](./database-isolation.md) - Per-tenant databases with D1, Turso, or custom
- [Tenant Lifecycle](./tenant-lifecycle.md) - Creating, managing, and deleting tenants
- [Settings Inheritance](./settings-inheritance.md) - Inherit configuration from control plane
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
3. All control plane resource servers are copied to the new tenant (if `syncResourceServers: true`)
4. All control plane roles are copied to the new tenant (if `syncRoles: true`)
5. Users added to that organization on the control plane can manage the child tenant

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
