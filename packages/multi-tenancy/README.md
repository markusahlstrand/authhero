# @authhero/multi-tenancy

Multi-tenancy support for AuthHero with organization-based access control, per-tenant database isolation, and subdomain routing.

## Features

- 🔐 **Organization-based Access Control** - Control tenant access via JWT tokens with `org_id` claims
- 💾 **Database Isolation** - Per-tenant databases with D1, Turso, or custom providers
- ⚙️ **Settings Inheritance** - Inherit configuration from main tenant to child tenants
- 🌐 **Subdomain Routing** - Automatic subdomain-to-tenant resolution
- 🔄 **Tenant Lifecycle** - Automated provisioning and deprovisioning
- 🪝 **Hooks Integration** - Seamless integration with AuthHero hooks system
- 📡 **Resource Server Sync** - Automatically sync resource servers from main tenant to all child tenants

## Installation

```bash
pnpm add @authhero/multi-tenancy
```

## Documentation

📚 **Full documentation**: [https://authhero.net/packages/multi-tenancy/](https://authhero.net/packages/multi-tenancy/)

- [Architecture](https://authhero.net/packages/multi-tenancy/architecture) - Organization-tenant model and token-based access
- [Database Isolation](https://authhero.net/packages/multi-tenancy/database-isolation) - Per-tenant databases
- [API Reference](https://authhero.net/packages/multi-tenancy/api-reference) - Complete API documentation

## Quick Start

```typescript
import { Hono } from "hono";
import { createAuthhero } from "authhero";
import { setupMultiTenancy } from "@authhero/multi-tenancy";

const multiTenancy = setupMultiTenancy({
  accessControl: {
    controlPlaneTenantId: "control_plane",
    defaultPermissions: ["tenant:admin"],
  },
});

const app = new Hono();

// Apply middleware
app.use("*", multiTenancy.middleware);

// Mount management routes
app.route("/management", multiTenancy.app);

// Mount AuthHero with hooks
app.route(
  "/",
  createAuthhero({
    dataAdapter: env.data,
    hooks: multiTenancy.hooks,
  }),
);
```

## Key Concepts

### Organization-Tenant Model

Organizations on a "main" tenant represent and control access to child tenants. Each organization maps to one child tenant.

### Token-Based Access

Access is controlled via the `org_id` claim in JWT tokens:

- **No `org_id`**: Main tenant only
- **With `org_id`**: Access to matching tenant

### Silent Authentication

Switch tenants by requesting a new token with a different organization:

```typescript
const token = await getAccessTokenSilently({
  authorizationParams: {
    organization: "tenant-id",
  },
});
```

## Resource Server Synchronization

Automatically sync resource servers (APIs) from the main tenant to all child tenants. When you create, update, or delete a resource server on the main tenant, it's automatically propagated to all other tenants.

```typescript
import { createResourceServerSyncHooks } from "@authhero/multi-tenancy";

const resourceServerHooks = createResourceServerSyncHooks({
  mainTenantId: "main",
  getChildTenantIds: async () => {
    // Return all tenant IDs except the main tenant
    const { tenants } = await adapters.tenants.list();
    return tenants.filter((t) => t.id !== "main").map((t) => t.id);
  },
  getAdapters: async (tenantId) => {
    // Return adapters for the target tenant
    return createAdaptersForTenant(tenantId);
  },
  // Optional: filter which resource servers to sync
  shouldSync: (resourceServer) => {
    // Only sync resource servers that start with "api:"
    return resourceServer.identifier.startsWith("api:");
  },
});

// Use with AuthHero config
const config: AuthHeroConfig = {
  dataAdapter,
  entityHooks: {
    resourceServers: resourceServerHooks,
  },
};
```

## License

MIT
