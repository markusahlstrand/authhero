# @authhero/multi-tenancy

Multi-tenancy support for AuthHero with organization-based access control, per-tenant database isolation, and subdomain routing.

## Features

- 🔐 **Organization-based Access Control** - Control tenant access via JWT tokens with `org_id` claims
- 💾 **Database Isolation** - Per-tenant databases with D1, Turso, or custom providers
- ⚙️ **Settings Inheritance** - Inherit configuration from main tenant to child tenants
- 🌐 **Subdomain Routing** - Automatic subdomain-to-tenant resolution
- 🔄 **Tenant Lifecycle** - Automated provisioning and deprovisioning
- 🪝 **Hooks Integration** - Seamless integration with AuthHero hooks system

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
    mainTenantId: "main",
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

## License

MIT
