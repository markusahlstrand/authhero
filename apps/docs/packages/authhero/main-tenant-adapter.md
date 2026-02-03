---
title: Main Tenant Adapter (Deprecated)
description: Legacy main tenant adapter - moved to @authhero/multi-tenancy as Runtime Fallback Adapter
---

# Main Tenant Adapter (Deprecated)

::: warning DEPRECATED
This adapter has been **deprecated** and moved to `@authhero/multi-tenancy` as the **Runtime Fallback Adapter**. Please migrate to the new package for continued support and new features.

**Migration Guide:** See [Runtime Fallback in Multi-Tenancy](/packages/multi-tenancy/runtime-fallback) for the new location and updated API.
:::

The Main Tenant Adapter provided fallback functionality from a designated "main" tenant to other tenants. This functionality is now available in `@authhero/multi-tenancy` with improved naming and better integration with other multi-tenancy features.

## Overview

In multi-tenant applications, you often want to provide common defaults across all tenants while allowing individual tenants to override specific settings. The Main Tenant Adapter solves this by:

- **Providing Fallbacks**: Tenants inherit default configurations from a main tenant
- **Allowing Overrides**: Tenant-specific values always take precedence over defaults
- **Transparent Integration**: Works seamlessly with existing data adapters
- **Selective Application**: Only applies fallbacks when configured

## Features

### Client Fallbacks

- Merges `web_origins`, `allowed_logout_urls`, and `callbacks` arrays
- Inherits tenant properties from main client
- Preserves tenant-specific overrides

### Connection Fallbacks

- Merges connection options from main tenant connections
- Matches connections by name for fallback inheritance
- Supports deep merging of connection options objects
- **Enables shared social connections** without exposing client secrets to individual tenants

### Shared Social Authentication

One of the most powerful features of the Main Tenant Adapter is the ability to provide social authentication (Google, Facebook, Apple, etc.) to all tenants without sharing sensitive client secrets:

- **Centralized OAuth Apps**: Configure OAuth applications once in the main tenant
- **Secret Protection**: Client secrets remain secure in the main tenant only
- **Automatic Availability**: Social connections become available to all tenants automatically
- **Tenant Customization**: Individual tenants can still override settings like scopes or branding

### Old Code (Deprecated)

```typescript
import { init, withMainTenantFallback } from "@authhero/authhero";
import createAdapters from "@authhero/kysely-adapter";

const db = // ... your database connection
const baseAdapters = createAdapters(db);

// Old approach (deprecated)
const adapters = withMainTenantFallback(baseAdapters, {
  mainTenantId: "main",
  mainClientId: "main-client"
});

const app = init({
  dataAdapter: adapters
});
```

### New Code (Recommended)

```typescript
import { withRuntimeFallback } from "@authhero/multi-tenancy";
import createAdapters from "@authhero/kysely-adapter";

const db = // ... your database connection
const baseAdapters = createAdapters(db);

// New approach
const adapters = withRuntimeFallback(baseAdapters, {
  controlPlaneTenantId: "main",      // renamed from mainTenantId
  controlPlaneClientId: "main-client" // renamed from mainClientId
});

// Use with standard authhero init or multi-tenancy init
import { init } from "authhero";
const app = init({
  dataAdapter: adapters
});
```

### Demo Application Example

```typescript
import { withMainTenantFallback } from "@authhero/authhero";
import createAdapters from "@authhero/kysely-adapter";

const baseAdapters = createAdapters(db);

// Use main tenant fallback for the demo
const adapters = withMainTenantFallback(baseAdapters, {
  mainTenantId: "default",
  mainClientId: "default",
});

const app = createApp({
  dataAdapter: adapters,
  allowedOrigins: ["http://localhost:5173", "https://local.authhe.ro"],
});
```

## How It Works

### Client Merging Process

When a client is retrieved, the adapter:

1. **Fetches the requested client** from the tenant
2. **Fetches the main client** (if `mainClientId` is configured)
3. **Merges arrays**: Combines `web_origins`, `allowed_logout_urls`, and `callbacks`
4. **Merges tenant properties**: Main tenant properties as defaults, client tenant takes precedence
5. **Processes connections**: Applies connection fallbacks for all tenant connections

### Connection Merging Process

When connections are retrieved, the adapter:

1. **Fetches tenant connections** for the requested tenant
2. **Fetches main tenant connections** (if `mainTenantId` is configured)
3. **Matches by name**: Finds corresponding main tenant connections by name
4. **Merges options**: Deep merges connection options (main as defaults, tenant overrides)
5. **Returns merged result**: Combined connections with fallback values applied

## Shared Social Authentication

One of the most valuable use cases for the Main Tenant Adapter is enabling shared social authentication across all tenants without exposing sensitive client secrets. This approach provides several key benefits:

### Benefits

- **Security**: OAuth client secrets remain centralized and secure in the main tenant
- **Simplified Management**: Configure OAuth applications once, use everywhere
- **Cost Efficiency**: No need to create separate OAuth apps for each tenant
- **Compliance**: Easier to audit and manage OAuth configurations centrally
- **Tenant Isolation**: Tenants can still customize non-sensitive settings

### How It Works

1. **Main tenant** contains the complete OAuth configuration with client secrets
2. **Individual tenants** inherit the OAuth connection automatically
3. **Tenant customizations** like scopes or redirect URIs can be overridden as needed
4. **Client secrets** are never exposed to individual tenant configurations

### Example: Google OAuth Setup

**Main tenant Google connection:**

```json
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    "client_id": "123456789.apps.googleusercontent.com",
    "client_secret": "GOCSPX-super-secret-key-here",
    "scope": "openid profile email",
    "authorization_endpoint": "https://accounts.google.com/oauth/authorize",
    "token_endpoint": "https://oauth2.googleapis.com/token"
  }
}
```

**Tenant A (inherits everything):**

```json
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    // All OAuth settings inherited from main tenant
    // Client secret remains secure and hidden
  }
}
```

**Tenant B (customizes scope):**

```json
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    "scope": "openid profile email https://www.googleapis.com/auth/calendar"
    // client_id, client_secret, and endpoints inherited from main
  }
}
```

**Merged results:**

_Tenant A gets:_

```json
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    "client_id": "123456789.apps.googleusercontent.com",
    "client_secret": "GOCSPX-super-secret-key-here", // inherited
    "scope": "openid profile email", // inherited
    "authorization_endpoint": "https://accounts.google.com/oauth/authorize",
    "token_endpoint": "https://oauth2.googleapis.com/token"
  }
}
```

_Tenant B gets:_

```json
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    "client_id": "123456789.apps.googleusercontent.com",
    "client_secret": "GOCSPX-super-secret-key-here", // inherited
    "scope": "openid profile email https://www.googleapis.com/auth/calendar", // overridden
    "authorization_endpoint": "https://accounts.google.com/oauth/authorize",
    "token_endpoint": "https://oauth2.googleapis.com/token"
  }
}
```

### Multiple Social Providers

You can easily set up multiple social authentication providers in the main tenant:

```typescript
// Main tenant setup with multiple social providers
await mainTenantData.connections.create("main", {
  name: "google-oauth2",
  strategy: "google-oauth2",
  options: {
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    scope: "openid profile email",
  },
});

await mainTenantData.connections.create("main", {
  name: "facebook",
  strategy: "facebook",
  options: {
    client_id: process.env.FACEBOOK_APP_ID,
    client_secret: process.env.FACEBOOK_APP_SECRET,
    scope: "email",
  },
});

await mainTenantData.connections.create("main", {
  name: "apple",
  strategy: "apple",
  options: {
    client_id: process.env.APPLE_CLIENT_ID,
    client_secret: process.env.APPLE_CLIENT_SECRET,
    team_id: process.env.APPLE_TEAM_ID,
    kid: process.env.APPLE_KEY_ID,
  },
});
```

All tenants will automatically inherit these social authentication options, making them available for login without any additional configuration.

## Configuration Examples

### Example 1: Email Connection Fallbacks

**Main tenant connection:**

```json
{
  "name": "email",
  "strategy": "email",
  "options": {
    "from": "noreply@company.com",
    "client_secret": "main-api-key",
    "authentication_method": "magic_link"
  }
}
```

**Tenant connection:**

```json
{
  "name": "email",
  "strategy": "email",
  "options": {
    "from": "support@tenant.com"
    // client_secret and authentication_method will be inherited
  }
}
```

**Merged result:**

```json
{
  "name": "email",
  "strategy": "email",
  "options": {
    "from": "support@tenant.com", // tenant override
    "client_secret": "main-api-key", // inherited from main
    "authentication_method": "magic_link" // inherited from main
  }
}
```

### Example 2: OAuth Connection Fallbacks

**Main tenant OAuth connection:**

```json
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    "client_id": "main-google-client-id",
    "client_secret": "main-google-secret",
    "scope": "openid profile email"
  }
}
```

**Tenant OAuth connection:**

```json
{
  "name": "google-oauth2",
  "strategy": "google-oauth2",
  "options": {
    "client_id": "tenant-specific-client-id"
    // client_secret and scope inherited from main
  }
}
```

### Example 3: Client Configuration Fallbacks

**Main client:**

```json
{
  "id": "main-client",
  "web_origins": ["https://app.company.com"],
  "allowed_logout_urls": ["https://app.company.com/logout"],
  "callbacks": ["https://app.company.com/callback"],
  "tenant": {
    "support_email": "support@company.com",
    "primary_color": "#007bff"
  }
}
```

**Tenant client:**

```json
{
  "id": "tenant-client",
  "web_origins": ["https://tenant.example.com"],
  "callbacks": ["https://tenant.example.com/auth"],
  "tenant": {
    "name": "Tenant Inc",
    "support_email": "help@tenant.com"
    // primary_color will be inherited from main
  }
}
```

**Merged result:**

```json
{
  "id": "tenant-client",
  "web_origins": [
    "https://app.company.com", // from main client
    "https://tenant.example.com" // from tenant client
  ],
  "allowed_logout_urls": [
    "https://app.company.com/logout" // inherited from main
  ],
  "callbacks": [
    "https://app.company.com/callback", // from main client
    "https://tenant.example.com/auth" // from tenant client
  ],
  "tenant": {
    "name": "Tenant Inc", // tenant override
    "support_email": "help@tenant.com", // tenant override
    "primary_color": "#007bff" // inherited from main
  }
}
```

## Performance Considerations

- **Lazy Loading**: Fallback lookups only occur when main tenant/client IDs are configured
- **Efficient Queries**: Minimizes duplicate database queries through smart caching
- **No Overhead**: Zero performance impact when fallback features aren't used
- **Connection Batching**: Fetches all connections at once for efficient processing

## Error Handling

The adapter gracefully handles various scenarios:

- **Missing main tenant/client**: Continues without fallbacks
- **Connection mismatches**: Only applies fallbacks where connections match by name
- **Invalid configurations**: Logs warnings but doesn't break functionality
- **Schema validation**: Uses Zod schemas to ensure data integrity

## Compatibility

The Main Tenant Adapter works with any data adapter implementing the `DataAdapters` interface:

- ✅ `@authhero/kysely-adapter`
- ✅ `@authhero/drizzle-adapter`
- ✅ Custom adapter implementations
- ✅ Any adapter following the standard interface

## Best Practices

### Setup Recommendations

1. **Create a dedicated main tenant** for configuration management
2. **Use environment variables** for flexible configuration across environments
3. **Document your fallback strategy** for your team
4. **Test tenant isolation** to ensure proper inheritance behavior

### Configuration Tips

1. **Start simple**: Begin with basic connection fallbacks before adding complex client configurations
2. **Use meaningful names**: Name your main tenant and client clearly (e.g., "main", "default", "company-defaults")
3. **Monitor performance**: Watch for any performance impact in high-traffic scenarios
4. **Plan for scale**: Consider how fallback strategies will work as you add more tenants

### Security Considerations

1. **Centralize OAuth secrets**: Keep all OAuth client secrets in the main tenant for better security
2. **Isolate sensitive data**: Don't put tenant-specific secrets in the main tenant
3. **Validate configurations**: Ensure fallback values are appropriate for all tenants
4. **Test inheritance**: Verify that security settings inherit correctly
5. **Audit changes**: Track changes to main tenant configurations that affect all tenants
6. **OAuth app management**: Use the main tenant to manage OAuth applications centrally, reducing the risk of secret exposure

## Troubleshooting

### Common Issues

**Fallbacks not working:**

- Verify `mainTenantId` and `mainClientId` are set correctly
- Check that main tenant and client exist in the database
- Ensure connection names match exactly between main and tenant

**Unexpected behavior:**

- Review the merging logic documentation above
- Check that tenant values are properly overriding main values
- Verify connection options are being merged correctly

**Performance issues:**

- Consider caching strategies for high-frequency operations
- Monitor database query patterns
- Optimize connection fetching if needed

### Debug Mode

Enable debug logging to troubleshoot fallback behavior:

```typescript
// Add logging to see fallback operations
const adapters = withMainTenantFallback(baseAdapters, {
  mainTenantId: "main",
  mainClientId: "main-client",
  debug: true, // Enable debug logging
});
```

## API Reference

### `withMainTenantFallback(baseAdapters, config)`

Wraps data adapters with main tenant fallback functionality.

**Parameters:**

- `baseAdapters: DataAdapters` - The base data adapters to wrap
- `config: MainTenantAdapterConfig` - Configuration object

**Config Options:**

- `mainTenantId?: string` - ID of the main tenant for connection fallbacks
- `mainClientId?: string` - ID of the main client for client fallbacks
- `debug?: boolean` - Enable debug logging (optional)

**Returns:** `DataAdapters` - Wrapped adapters with fallback functionality

### `MainTenantAdapterConfig`

Configuration interface for the main tenant adapter.

```typescript
interface MainTenantAdapterConfig {
  mainTenantId?: string; // Optional main tenant ID
  mainClientId?: string; // Optional main client ID
  debug?: boolean; // Optional debug mode
}
```
