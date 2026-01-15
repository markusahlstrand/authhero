---
title: Multi-Tenancy API Reference
description: Complete API reference for @authhero/multi-tenancy including configuration types, access control, database isolation, and subdomain routing.
---

# API Reference

Complete API reference for the `@authhero/multi-tenancy` package.

## High-Level API

### initMultiTenant()

The easiest way to set up multi-tenancy. Automatically configures sync hooks, tenants API, middleware, and runtime fallback.

```typescript
function initMultiTenant(config: MultiTenantConfig): MultiTenantResult
```

**Parameters:**

- `config`: `MultiTenantConfig` - Multi-tenant configuration

**Returns:**

- `app`: Hono app instance with multi-tenancy configured
- `controlPlaneTenantId`: The control plane tenant ID

**Example:**

```typescript
import { initMultiTenant } from "@authhero/multi-tenancy";
import createAdapters from "@authhero/kysely-adapter";

const { app } = initMultiTenant({
  dataAdapter: createAdapters(db),
  controlPlane: {
    tenantId: "control_plane",
    clientId: "default_client",
  },
});

export default app;
```

### MultiTenantConfig

Configuration for `initMultiTenant()`.

```typescript
interface MultiTenantConfig extends Omit<AuthHeroConfig, "entityHooks" | "managementApiExtensions"> {
  // Control plane configuration (optional but recommended)
  controlPlane?: ControlPlaneConfig;

  // Entity sync configuration (default: { resourceServers: true, roles: true })
  sync?: { resourceServers?: boolean; roles?: boolean } | false;

  // Default permissions for new tenant organizations
  defaultPermissions?: string[];

  // Whether to require organization match for tenant access
  requireOrganizationMatch?: boolean;

  // Custom function to get child tenant IDs
  getChildTenantIds?: () => Promise<string[]>;

  // Custom function to get adapters for a specific tenant
  getAdapters?: (tenantId: string) => Promise<DataAdapters>;

  // Additional management API extensions
  managementApiExtensions?: AuthHeroConfig["managementApiExtensions"];

  // Additional entity hooks
  entityHooks?: AuthHeroConfig["entityHooks"];
}
```

### ControlPlaneConfig

Control plane configuration for runtime fallback and access control.

```typescript
interface ControlPlaneConfig {
  // The control plane tenant ID - manages all other tenants
  tenantId: string;

  // The control plane client ID for fallback client settings
  // (web_origins, callbacks, etc. are merged with child tenant clients)
  clientId: string;
}
```

**Example:**

```typescript
const { app } = initMultiTenant({
  dataAdapter,
  controlPlane: {
    tenantId: "main",
    clientId: "main_client",
  },
});
```

When `controlPlane` is configured:
- **Runtime Fallback**: Connection secrets, OAuth credentials, and client settings fallback to control plane without copying
- **Access Control**: `/api/v2/tenants` endpoint filters based on user's organization memberships
- **Organization Sync**: Organizations are automatically created on control plane when tenants are created

## Lower-Level APIs

### MultiTenancyConfig

Main configuration object for lower-level multi-tenancy setup using `setupMultiTenancy()`.

```typescript
interface MultiTenancyConfig {
  accessControl?: AccessControlConfig;
  databaseIsolation?: DatabaseIsolationConfig;
  subdomainRouting?: SubdomainRoutingConfig;
}
```

### AccessControlConfig

Configure organization-based access control.

```typescript
interface AccessControlConfig {
  // ID of the control plane tenant that manages other tenants
  controlPlaneTenantId: string;

  // Require org_id in token to match tenant being accessed (default: true)
  requireOrganizationMatch?: boolean;

  // Default permissions to grant to organizations
  defaultPermissions?: string[];

  // Default roles to assign to organizations
  defaultRoles?: string[];
}
```

**Example:**

```typescript
{
  controlPlaneTenantId: "main",
  requireOrganizationMatch: true,
  defaultPermissions: ["tenant:admin", "users:read", "users:write"],
  defaultRoles: ["tenant-admin"],
}
```

### DatabaseIsolationConfig

Configure per-tenant database isolation.

```typescript
interface DatabaseIsolationConfig {
  // Get data adapters for a specific tenant
  getAdapters: (tenantId: string) => Promise<DataAdapters>;

  // Called when a new tenant is provisioned
  onProvision?: (tenantId: string) => Promise<void>;

  // Called when a tenant is deprovisioned/deleted
  onDeprovision?: (tenantId: string) => Promise<void>;
}
```

**Example:**

```typescript
{
  getAdapters: async (tenantId) => {
    const db = await getTenantDatabase(tenantId);
    return createAdapter(db);
  },
  onProvision: async (tenantId) => {
    await createDatabase(tenantId);
    await runMigrations(tenantId);
  },
  onDeprovision: async (tenantId) => {
    await backupDatabase(tenantId);
    await deleteDatabase(tenantId);
  },
}
```

### RuntimeFallbackConfig

Configure runtime fallback for connection secrets and settings.

::: tip Use Case
Use this to share connection secrets, OAuth credentials, and SMTP settings across tenants **without copying them**. Sensitive data stays in the control plane.
:::

```typescript
interface RuntimeFallbackConfig {
  // Control plane tenant ID for connection/setting fallbacks
  controlPlaneTenantId?: string;

  // Control plane client ID for client setting fallbacks
  controlPlaneClientId?: string;
}
```

**Example:**

```typescript
import { withRuntimeFallback } from "@authhero/multi-tenancy";

const adapters = withRuntimeFallback(baseAdapters, {
  controlPlaneTenantId: "control_plane",
  controlPlaneClientId: "control_plane_client"
});
```

**See also:** [Runtime Fallback Guide](./runtime-fallback.md)

### SubdomainRoutingConfig

Configure subdomain-based tenant routing.

```typescript
interface SubdomainRoutingConfig {
  // Base domain for tenant subdomains (e.g., "auth.example.com")
  baseDomain: string;

  // Use organizations to resolve subdomains (default: true)
  useOrganizations?: boolean;

  // Custom subdomain resolver function
  resolveSubdomain?: (
    subdomain: string,
    context: Context,
  ) => Promise<string | null>;

  // Subdomains reserved for system use
  reservedSubdomains?: string[];
}
```

**Example:**

```typescript
{
  baseDomain: "auth.example.com",
  useOrganizations: true,
  reservedSubdomains: ["www", "api", "admin"],
  resolveSubdomain: async (subdomain) => {
    const tenant = await db.tenants.findBySubdomain(subdomain);
    return tenant?.id || null;
  },
}
```

## Factory Functions

### setupMultiTenancy()

Creates a complete multi-tenancy setup with hooks, middleware, and routes.

```typescript
function setupMultiTenancy(config: MultiTenancyConfig): {
  hooks: MultiTenancyHooks;
  middleware: MiddlewareHandler;
  app: Hono;
  config: MultiTenancyConfig;
};
```

**Parameters:**

- `config`: Multi-tenancy configuration

**Returns:**

- `hooks`: Hook functions to integrate with AuthHero
- `middleware`: Combined middleware for access control, subdomain routing, and database resolution
- `app`: Hono app with tenant management routes
- `config`: Resolved configuration

**Example:**

```typescript
const multiTenancy = setupMultiTenancy({
  accessControl: {
    mainTenantId: "main",
  },
});

app.use("*", multiTenancy.middleware);
app.route("/management", multiTenancy.app);
app.route("/", createAuthhero({ hooks: multiTenancy.hooks }));
```

### createMultiTenancyHooks()

Creates hook functions for AuthHero integration.

```typescript
function createMultiTenancyHooks(config: MultiTenancyConfig): MultiTenancyHooks;
```

**Parameters:**

- `config`: Multi-tenancy configuration

**Returns:**

- Hook functions implementing the AuthHero hooks interface

**Example:**

```typescript
const hooks = createMultiTenancyHooks({
  accessControl: { mainTenantId: "main" },
  databaseIsolation: { getAdapters: factory.getAdapters },
});

const app = createAuthhero({
  hooks: {
    ...hooks,
    // Your custom hooks
  },
});
```

### createMultiTenancy()

Creates a Hono app with tenant management routes.

```typescript
function createMultiTenancy(config: MultiTenancyConfig): Hono;
```

**Parameters:**

- `config`: Multi-tenancy configuration

**Returns:**

- Hono app with CRUD routes for tenant management

**Example:**

```typescript
const tenantApp = createMultiTenancy({
  accessControl: { mainTenantId: "main" },
});

app.route("/management", tenantApp);
```

## Middleware Functions

### createMultiTenancyMiddleware()

Creates combined middleware for access control, subdomain routing, and database resolution.

```typescript
function createMultiTenancyMiddleware(
  config: MultiTenancyConfig,
): MiddlewareHandler;
```

**Parameters:**

- `config`: Multi-tenancy configuration

**Returns:**

- Hono middleware handler

**Example:**

```typescript
const middleware = createMultiTenancyMiddleware({
  accessControl: { mainTenantId: "main" },
  subdomainRouting: { baseDomain: "auth.example.com" },
});

app.use("*", middleware);
```

### createAccessControlMiddleware()

Creates middleware for organization-based access control.

```typescript
function createAccessControlMiddleware(
  config: MultiTenancyConfig,
): MiddlewareHandler;
```

**Example:**

```typescript
const accessControl = createAccessControlMiddleware({
  accessControl: {
    mainTenantId: "main",
    requireOrganizationMatch: true,
  },
});

app.use("*", accessControl);
```

### createSubdomainMiddleware()

Creates middleware for subdomain-based tenant routing.

```typescript
function createSubdomainMiddleware(
  config: MultiTenancyConfig,
): MiddlewareHandler;
```

**Example:**

```typescript
const subdomainRouter = createSubdomainMiddleware({
  subdomainRouting: {
    baseDomain: "auth.example.com",
    reservedSubdomains: ["www", "api"],
  },
});

app.use("*", subdomainRouter);
```

### createDatabaseMiddleware()

Creates middleware for per-tenant database resolution.

```typescript
function createDatabaseMiddleware(
  config: MultiTenancyConfig,
): MiddlewareHandler;
```

**Example:**

```typescript
const dbMiddleware = createDatabaseMiddleware({
  databaseIsolation: {
    getAdapters: factory.getAdapters,
  },
});

app.use("*", dbMiddleware);
```

### createProtectSyncedMiddleware()

Creates middleware to protect system resources from modification.

```typescript
function createProtectSyncedMiddleware(): MiddlewareHandler;
```

**Example:**

```typescript
const protect = createProtectSyncedMiddleware();

app.use("/api/v2/*", protect);
```

## Adapter Functions

### createRuntimeFallbackAdapter()

Creates a wrapped adapter with runtime fallback functionality from control plane.

```typescript
function createRuntimeFallbackAdapter(
  baseAdapters: DataAdapters,
  config: RuntimeFallbackConfig,
): DataAdapters;
```

**Parameters:**

- `baseAdapters: DataAdapters` - The base data adapters to wrap
- `config: RuntimeFallbackConfig` - Configuration for runtime fallback

**Returns:**

- `DataAdapters` - Wrapped adapters with fallback functionality

**Example:**

```typescript
import { createRuntimeFallbackAdapter } from "@authhero/multi-tenancy";

const adapters = createRuntimeFallbackAdapter(baseAdapters, {
  controlPlaneTenantId: "control_plane",
  controlPlaneClientId: "control_plane_client"
});
```

**See also:** [Runtime Fallback Guide](./runtime-fallback.md)

### withRuntimeFallback()

Convenience helper for `createRuntimeFallbackAdapter`.

```typescript
function withRuntimeFallback(
  baseAdapters: DataAdapters,
  config: RuntimeFallbackConfig,
): DataAdapters;
```

**Parameters:**

- `baseAdapters: DataAdapters` - The base data adapters to wrap
- `config: RuntimeFallbackConfig` - Configuration for runtime fallback

**Returns:**

- `DataAdapters` - Wrapped adapters with fallback functionality

**Example:**

```typescript
import { withRuntimeFallback } from "@authhero/multi-tenancy";

const adapters = withRuntimeFallback(baseAdapters, {
  controlPlaneTenantId: "control_plane",
  controlPlaneClientId: "control_plane_client"
});
```

## Database Factory

### DatabaseFactory Interface

Interface for implementing per-tenant database factories.

```typescript
interface DatabaseFactory {
  // Get data adapters for a tenant's database
  getAdapters(tenantId: string): Promise<DataAdapters>;

  // Provision a new database for a tenant
  provision(tenantId: string): Promise<void>;

  // Deprovision (delete) a tenant's database
  deprovision(tenantId: string): Promise<void>;
}
```

**Example Implementation:**

```typescript
const factory: DatabaseFactory = {
  async getAdapters(tenantId: string) {
    const db = await getDatabaseConnection(tenantId);
    return createAdapter(db);
  },

  async provision(tenantId: string) {
    await createDatabase(tenantId);
    await runMigrations(tenantId);
  },

  async deprovision(tenantId: string) {
    await backupDatabase(tenantId);
    await deleteDatabase(tenantId);
  },
};
```

## Hooks

### MultiTenancyHooks Interface

Hook functions that integrate with AuthHero's lifecycle.

```typescript
interface MultiTenancyHooks {
  // Called before creating a tenant
  onTenantCreating?: (tenant: Tenant) => Promise<void>;

  // Called after a tenant is created
  onTenantCreated?: (tenant: Tenant) => Promise<void>;

  // Called before updating a tenant
  onTenantUpdating?: (oldTenant: Tenant, newTenant: Tenant) => Promise<void>;

  // Called after a tenant is updated
  onTenantUpdated?: (oldTenant: Tenant, newTenant: Tenant) => Promise<void>;

  // Called before deleting a tenant
  onTenantDeleting?: (tenant: Tenant) => Promise<void>;

  // Called after a tenant is deleted
  onTenantDeleted?: (tenant: Tenant) => Promise<void>;
}
```

**Example:**

```typescript
const hooks: MultiTenancyHooks = {
  onTenantCreated: async (tenant) => {
    console.log(`Tenant ${tenant.id} created`);
    await sendWelcomeEmail(tenant);
  },

  onTenantDeleting: async (tenant) => {
    console.log(`Tenant ${tenant.id} will be deleted`);
    await backupTenantData(tenant.id);
  },
};
```

## Management Routes

The tenant management app exposes the following routes:

### GET /tenants

List all tenants (main tenant only).

**Headers:**

- `Authorization: Bearer <token>` - Token without org_id

**Query Parameters:**

- `page?: number` - Page number (default: 1)
- `per_page?: number` - Items per page (default: 50, max: 100)

**Response:**

```typescript
{
  tenants: Tenant[];
  total: number;
  page: number;
  per_page: number;
}
```

### POST /tenants

Create a new tenant (main tenant only).

**Headers:**

- `Authorization: Bearer <token>` - Token without org_id
- `Content-Type: application/json`

**Body:**

```typescript
{
  id: string;
  name: string;
  friendly_name?: string;
  // ... other tenant fields
}
```

**Response:**

```typescript
{
  tenant: Tenant;
}
```

### GET /tenants/:id

Get a specific tenant (main tenant only).

**Headers:**

- `Authorization: Bearer <token>` - Token without org_id

**Response:**

```typescript
{
  tenant: Tenant;
}
```

### PATCH /tenants/:id

Update a tenant (main tenant only).

**Headers:**

- `Authorization: Bearer <token>` - Token without org_id
- `Content-Type: application/json`

**Body:**

```typescript
{
  name?: string;
  friendly_name?: string;
  // ... other fields to update
}
```

**Response:**

```typescript
{
  tenant: Tenant;
}
```

### DELETE /tenants/:id

Delete a tenant (main tenant only).

**Headers:**

- `Authorization: Bearer <token>` - Token without org_id

**Response:**

```typescript
{
  success: boolean;
}
```

## Context Variables

Variables available in request context after middleware:

### tenant_id

The resolved tenant ID for the current request.

```typescript
app.get("/api/users", async (c) => {
  const tenantId = c.get("tenant_id");
  // Use tenantId...
});
```

### org_id

The organization ID from the JWT token (if present).

```typescript
app.get("/api/users", async (c) => {
  const orgId = c.get("org_id");
  // Use orgId...
});
```

## Type Exports

### Tenant

```typescript
interface Tenant {
  id: string;
  name: string;
  friendly_name?: string;
  created_at: string;
  updated_at: string;
  // ... additional fields
}
```

### DataAdapters

```typescript
interface DataAdapters {
  users: UserAdapter;
  applications: ApplicationAdapter;
  connections: ConnectionAdapter;
  // ... other adapters
}
```

## Next Steps

- [Architecture](./architecture.md) - Understanding the multi-tenancy model
- [Database Isolation](./database-isolation.md) - Per-tenant databases
- [Migration Guide](./migration.md) - Migrate from single to multi-tenant
