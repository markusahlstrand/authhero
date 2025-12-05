# @authhero/multi-tenancy

Multi-tenancy support for AuthHero with organization-based access control, per-tenant database isolation, and subdomain routing.

## Overview

This package provides a complete multi-tenancy solution for AuthHero-based authentication systems. It enables you to:

- **Manage multiple tenants** from a single "main" tenant
- **Control access** using organization-based tokens
- **Isolate data** with per-tenant databases (D1, Turso, or custom)
- **Route requests** via subdomains
- **Inherit settings** from the main tenant to child tenants

## Installation

```bash
pnpm add @authhero/multi-tenancy
# or
npm install @authhero/multi-tenancy
```

## Quick Start

```typescript
import { createAuthhero } from "authhero";
import { setupMultiTenancy } from "@authhero/multi-tenancy";

// Setup multi-tenancy
const multiTenancy = setupMultiTenancy({
  accessControl: {
    mainTenantId: "main",
    defaultPermissions: ["tenant:admin"],
  },
});

// Use with AuthHero
const app = new Hono();
app.use("*", multiTenancy.middleware);
app.route("/management", multiTenancy.app);
app.route(
  "/",
  createAuthhero({
    hooks: multiTenancy.hooks,
    // ... your config
  }),
);
```

## Documentation

- [Architecture](./architecture.md) - Organization-tenant model and token-based access
- [Database Isolation](./database-isolation.md) - Per-tenant databases with D1, Turso, or custom
- [Tenant Lifecycle](./tenant-lifecycle.md) - Creating, managing, and deleting tenants
- [Settings Inheritance](./settings-inheritance.md) - Inherit configuration from main tenant
- [Subdomain Routing](./subdomain-routing.md) - Route requests based on subdomains
- [API Reference](./api-reference.md) - Complete API documentation
- [Migration Guide](./migration.md) - Moving from single to multi-tenant

## Key Concepts

### Organization-Tenant Model

The multi-tenancy system uses organizations on a "main" tenant to represent and control access to child tenants:

- **Main Tenant**: The management tenant that controls all other tenants
- **Organizations**: Each organization on the main tenant maps to a child tenant
- **Child Tenants**: Independent tenants with their own users, applications, and configuration

### Token-Based Access Control

Access to tenants is controlled via the `org_id` claim in JWT tokens:

- **No `org_id`**: Access to main tenant only
- **With `org_id`**: Access to the tenant matching the organization ID

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
