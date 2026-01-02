---
title: Multi-Tenancy API Reference
description: Complete API reference for @authhero/multi-tenancy including configuration types, access control, database isolation, and subdomain routing.
---

# API Reference

Complete API reference for the `@authhero/multi-tenancy` package.

## Configuration Types

### MultiTenancyConfig

Main configuration object for multi-tenancy setup.

```typescript
interface MultiTenancyConfig {
  accessControl?: AccessControlConfig;
  databaseIsolation?: DatabaseIsolationConfig;
  settingsInheritance?: SettingsInheritanceConfig;
  subdomainRouting?: SubdomainRoutingConfig;
}
```

### AccessControlConfig

Configure organization-based access control.

```typescript
interface AccessControlConfig {
  // ID of the main tenant that manages other tenants
  mainTenantId: string;

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
  mainTenantId: "main",
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

### SettingsInheritanceConfig

Configure settings inheritance from main tenant.

```typescript
interface SettingsInheritanceConfig {
  // Whether to inherit settings from main tenant (default: true)
  inheritFromMain?: boolean;

  // Specific keys to inherit (if not set, inherits all compatible keys)
  inheritedKeys?: (keyof Tenant)[];

  // Keys to exclude from inheritance
  excludedKeys?: (keyof Tenant)[];

  // Transform settings before applying to new tenant
  transformSettings?: (
    settings: Partial<Tenant>,
    tenantId: string,
    metadata?: Record<string, any>,
  ) => Partial<Tenant> | Promise<Partial<Tenant>>;
}
```

**Example:**

```typescript
{
  inheritFromMain: true,
  inheritedKeys: ["support_email", "logo", "primary_color"],
  transformSettings: (settings, tenantId) => ({
    ...settings,
    support_email: `support+${tenantId}@example.com`,
  }),
}
```

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
