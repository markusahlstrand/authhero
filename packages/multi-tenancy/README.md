# @authhero/multi-tenancy

Multi-tenancy support for AuthHero with organization-based access control, per-tenant database isolation, and subdomain routing.

## Features

- 🔐 **Organization-based Access Control** - Control tenant access via JWT tokens with `org_id` claims
- 💾 **Database Isolation** - Per-tenant databases with D1, Turso, or custom providers
- ⚙️ **Settings Inheritance** - Inherit configuration from main tenant to child tenants
- 🌐 **Subdomain Routing** - Automatic subdomain-to-tenant resolution
- 🔄 **Tenant Lifecycle** - Automated provisioning and deprovisioning
- 🪝 **Composable Architecture** - Combine multi-tenancy features with the base AuthHero package
- 📡 **Entity Sync** - Automatically sync resource servers, roles, and connections from control plane to all child tenants

## Installation

```bash
pnpm add authhero @authhero/multi-tenancy
```

::: tip Peer Dependency
`@authhero/multi-tenancy` requires `authhero` as a peer dependency. Both packages must be installed.
:::

## Documentation

📚 **Full documentation**: [https://authhero.net/packages/multi-tenancy/](https://authhero.net/packages/multi-tenancy/)

- [Architecture](https://authhero.net/packages/multi-tenancy/architecture) - Organization-tenant model and token-based access
- [Database Isolation](https://authhero.net/packages/multi-tenancy/database-isolation) - Per-tenant databases
- [API Reference](https://authhero.net/packages/multi-tenancy/api-reference) - Complete API documentation

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

### Customization

```typescript
const { app } = initMultiTenant({
  dataAdapter,
  controlPlaneTenantId: "main",
  sync: {
    resourceServers: true,
    roles: true,
    connections: false, // Don't sync connections
  },
  defaultPermissions: ["tenant:admin", "tenant:read"],
});
```

### Advanced Setup

For more control, use the lower-level APIs:

```typescript
import { init, fetchAll } from "authhero";
import {
  createSyncHooks,
  createTenantsOpenAPIRouter,
  createProtectSyncedMiddleware,
} from "@authhero/multi-tenancy";

const { entityHooks, tenantHooks } = createSyncHooks({
  controlPlaneTenantId: "control_plane",
  getChildTenantIds: async () => {
    /* ... */
  },
  getAdapters: async () => dataAdapter,
  getControlPlaneAdapters: async () => dataAdapter,
});

const tenantsRouter = createTenantsOpenAPIRouter(
  { accessControl: { controlPlaneTenantId: "control_plane" } },
  { tenants: tenantHooks },
);

const { app } = init({
  dataAdapter,
  entityHooks,
  managementApiExtensions: [{ path: "/tenants", router: tenantsRouter }],
});

app.use("/api/v2/*", createProtectSyncedMiddleware());
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
    resourceServers: [resourceServerHooks],
  },
};
```

## Migration Guide

### Migrating from Legacy Settings Inheritance

If you're using the deprecated settings inheritance functions, migrate to the new runtime fallback API:

#### Before (Deprecated)

```typescript
import {
  withSettingsInheritance,
  SettingsInheritanceConfig,
} from "@authhero/multi-tenancy";

const config: SettingsInheritanceConfig = {
  controlPlaneTenantId: "main",
  controlPlaneClientId: "main-client",
};

const adapters = withSettingsInheritance(baseAdapters, config);
```

#### After (Current)

```typescript
import {
  withRuntimeFallback,
  RuntimeFallbackConfig,
} from "@authhero/multi-tenancy";

const config: RuntimeFallbackConfig = {
  controlPlaneTenantId: "main",
  controlPlaneClientId: "main-client",
};

const adapters = withRuntimeFallback(baseAdapters, config);
```

**What changed:**

- `withSettingsInheritance` → `withRuntimeFallback`
- `createSettingsInheritanceAdapter` → `createRuntimeFallbackAdapter`
- `SettingsInheritanceConfig` → `RuntimeFallbackConfig`

The functionality remains identical - this is purely a naming change to better reflect that settings are inherited at runtime without copying data between tenants.

## License

MIT
