---
title: Runtime Fallback Adapter
description: Provide runtime fallback configurations from control plane to child tenants. Share social connections, merge settings, and enable centralized OAuth apps.
---

# Runtime Fallback Adapter

The Runtime Fallback Adapter provides runtime fallback functionality from a control plane tenant to child tenants. This allows you to set up default configurations that child tenants can inherit while still allowing tenant-specific customizations.

::: info Complementary Approaches
This adapter provides **runtime value fallback** (sensitive data stays in control plane), while **Entity Sync** (see [Entity Sync](./entity-sync.md)) copies entities to child tenants (needed for foreign key references).
:::

## Overview

In multi-tenant applications, you often want to provide common defaults across all tenants while allowing individual tenants to override specific settings. The Runtime Fallback Adapter solves this by:

- **Providing Fallbacks at Query Time**: Values are merged when data is retrieved
- **Protecting Sensitive Data**: Connection secrets, API keys remain in control plane only
- **Allowing Overrides**: Tenant-specific values always take precedence
- **Transparent Integration**: Works seamlessly with existing data adapters

## Runtime Fallback vs Entity Sync

| Feature | Runtime Fallback | Entity Sync |
|---------|------------------|-------------|
| **When applied** | At query time | At creation/update time |
| **Sensitive data** | Stays in control plane | Stripped before copying |
| **Use case** | Connection secrets, SMTP keys, default URLs | Resource servers, roles (foreign keys) |
| **Storage** | Single copy in control plane | Copied to each tenant |
| **Updates** | Immediate (next query) | Requires sync operation |

## Features

### Client Fallbacks

- Merges `web_origins`, `allowed_logout_urls`, and `callbacks` arrays
- Inherits tenant properties from control plane client
- Preserves tenant-specific overrides

### Connection Fallbacks

- Merges connection options from control plane connections
- Matches connections by name for fallback inheritance
- Supports deep merging of connection options objects
- **Enables shared social connections** without exposing client secrets to individual tenants

### Shared Social Authentication

One of the most powerful features is the ability to provide social authentication (Google, Facebook, Apple, etc.) to all tenants without sharing sensitive client secrets:

- **Centralized OAuth Apps**: Configure OAuth applications once in the control plane
- **Secret Protection**: Client secrets remain secure in the control plane only
- **Automatic Availability**: Social connections become available to all tenants automatically
- **Tenant Customization**: Individual tenants can still override settings like scopes or branding

## Usage

### Basic Setup

```typescript
import { withRuntimeFallback } from "@authhero/multi-tenancy";
import createAdapters from "@authhero/kysely-adapter";

// Create your base data adapters
const db = // ... your database connection
const baseAdapters = createAdapters(db);

// Wrap with runtime fallback functionality
const adapters = withRuntimeFallback(baseAdapters, {
  controlPlaneTenantId: "main",           // Control plane tenant for defaults
  controlPlaneClientId: "main-client"     // Control plane client for defaults
});

// Use with standard AuthHero init
import { init } from "authhero";
const app = init({
  dataAdapter: adapters
});
```

### Environment-Based Configuration

You can configure the runtime fallback adapter using environment variables:

```typescript
import { withRuntimeFallback } from "@authhero/multi-tenancy";

const adapters = withRuntimeFallback(baseAdapters, {
  controlPlaneTenantId: process.env.CONTROL_PLANE_TENANT_ID,
  controlPlaneClientId: process.env.CONTROL_PLANE_CLIENT_ID,
});
```

### Combined with Multi-Tenancy Features

```typescript
import { init, withRuntimeFallback } from "@authhero/multi-tenancy";

// First, wrap adapters with runtime fallback
const baseAdapters = createAdapters(db);
const fallbackAdapters = withRuntimeFallback(baseAdapters, {
  controlPlaneTenantId: "control_plane",
  controlPlaneClientId: "control_plane_client"
});

// Then use with multi-tenancy init for entity sync
const { app } = init({
  dataAdapter: fallbackAdapters,
  controlPlaneTenantId: "control_plane",
  syncResourceServers: true,
  syncRoles: true,
});
```

## How It Works

### Client Retrieval Flow

When a client is retrieved:

1. **Fetches the client** from the database
2. **Fetches control plane client** (if `controlPlaneClientId` is configured)
3. **Merges arrays** (`web_origins`, `allowed_logout_urls`, `callbacks`)
4. **Merges tenant properties** with control plane fallbacks
5. **Fetches and merges connections** for the client

### Connection Fallback Flow

When connections are retrieved:

1. **Fetches tenant's connections** from the database
2. **Fetches control plane connections** (if `controlPlaneTenantId` is configured)
3. **Matches connections by name**
4. **Merges connection options** - tenant values override control plane values
5. **Returns merged connections**

### Fallback Priority

Settings are merged with tenant-specific values always taking precedence:

```typescript
// Control plane connection
{
  name: "email",
  options: {
    from: "noreply@example.com",
    smtp_host: "smtp.example.com",
    smtp_user: "noreply@example.com",
    smtp_password: "secret123"  // Sensitive!
  }
}

// Tenant's connection (override from address only)
{
  name: "email",
  options: {
    from: "hello@tenant.com"
    // smtp_password is inherited from control plane
  }
}

// Merged result (returned to tenant)
{
  name: "email",
  options: {
    from: "hello@tenant.com",          // Tenant override
    smtp_host: "smtp.example.com",     // Fallback
    smtp_user: "noreply@example.com",  // Fallback
    smtp_password: "secret123"         // Fallback (stays secure)
  }
}
```

## Common Patterns

### Shared Social Connections

Set up social authentication once in the control plane:

```typescript
// In control plane tenant
POST /api/v2/connections
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    "client_id": "your-google-client-id",
    "client_secret": "your-google-client-secret",
    "scope": ["openid", "email", "profile"]
  }
}

// Child tenants can use it immediately without storing secrets
// They can override display settings:
POST /api/v2/connections  // In child tenant
{
  "name": "google-oauth2",
  "display_name": "Sign in with Google for Acme Corp",
  "options": {
    "scope": ["openid", "email", "profile", "calendar"]  // Custom scopes
    // client_id and client_secret inherited from control plane
  }
}
```

### Shared Email Provider

Set up email provider once in control plane:

```typescript
// In control plane
POST /api/v2/email-providers
{
  "name": "smtp",
  "credentials": {
    "smtp_host": "smtp.sendgrid.net",
    "smtp_port": 587,
    "smtp_user": "apikey",
    "smtp_password": "SG.xxx..."
  }
}

// Child tenants inherit SMTP settings
// They can override from address per tenant
PATCH /api/v2/tenants/{id}
{
  "sender_email": "noreply@tenant.com",
  "sender_name": "Acme Corp"
}
```

### Default Client URLs

Provide default callback URLs from control plane:

```typescript
// Control plane client
{
  "client_id": "control_plane_client",
  "callbacks": [
    "http://localhost:3000/callback",
    "https://dev.example.com/callback"
  ]
}

// Tenant client inherits and extends
{
  "client_id": "tenant_client",
  "callbacks": [
    "https://tenant.com/callback"
  ]
}

// Merged result includes both
{
  "client_id": "tenant_client",
  "callbacks": [
    "http://localhost:3000/callback",    // From control plane
    "https://dev.example.com/callback",  // From control plane
    "https://tenant.com/callback"        // From tenant
  ]
}
```

## API Reference

### `createRuntimeFallbackAdapter(baseAdapters, config)`

Creates a wrapped adapter with runtime fallback functionality.

**Parameters:**
- `baseAdapters: DataAdapters` - The base data adapters to wrap
- `config: RuntimeFallbackConfig` - Configuration object

**Returns:** `DataAdapters` - Wrapped adapters with fallback functionality

### `withRuntimeFallback(baseAdapters, config)`

Convenience helper for `createRuntimeFallbackAdapter`.

**Parameters:**
- `baseAdapters: DataAdapters` - The base data adapters to wrap
- `config: RuntimeFallbackConfig` - Configuration object

**Returns:** `DataAdapters` - Wrapped adapters with fallback functionality

### `RuntimeFallbackConfig`

Configuration interface for runtime fallback:

```typescript
interface RuntimeFallbackConfig {
  controlPlaneTenantId?: string;  // Control plane tenant ID for connection fallbacks
  controlPlaneClientId?: string;  // Control plane client ID for client fallbacks
}
```

## Migration from @authhero/authhero

If you were using the deprecated `withMainTenantFallback` from `@authhero/authhero`:

### Before (Deprecated)

```typescript
import { withMainTenantFallback } from "@authhero/authhero";

const adapters = withMainTenantFallback(baseAdapters, {
  mainTenantId: "main",
  mainClientId: "main-client"
});
```

### After (Current)

```typescript
import { withRuntimeFallback } from "@authhero/multi-tenancy";

const adapters = withRuntimeFallback(baseAdapters, {
  controlPlaneTenantId: "main",      // renamed from mainTenantId
  controlPlaneClientId: "main-client" // renamed from mainClientId
});
```

The functionality is identical, only the naming has changed to better reflect the control plane/child tenant model.

## Best Practices

1. **Use for Sensitive Data**: Perfect for connection secrets, SMTP credentials, OAuth keys
2. **Combine with Entity Sync**: Use sync for resource servers/roles, fallback for secrets
3. **Document Overrides**: Clearly document which settings can be overridden by tenants
4. **Test Fallbacks**: Verify fallback behavior works as expected in development
5. **Monitor Usage**: Track which tenants use fallback vs custom configs

## Troubleshooting

### Fallbacks Not Working

Check that:
- `controlPlaneTenantId` and `controlPlaneClientId` are set correctly
- Control plane tenant/client exists in database
- Connection names match between control plane and child tenant
- Adapter is properly wrapped before use

### Wrong Values Being Used

Remember:
- Tenant values **always override** control plane values
- Arrays are **merged** (both control plane and tenant values included)
- Null/empty tenant values don't trigger fallback - only missing properties do

## See Also

- [Entity Sync](./entity-sync.md) - Sync resource servers and roles to child tenants
- [Control Plane](./control-plane.md) - Understanding the control plane model
