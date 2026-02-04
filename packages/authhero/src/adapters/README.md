# Main Tenant Adapter

The Main Tenant Adapter provides fallback functionality from a designated "main" tenant, allowing other tenants to inherit default configurations. This is useful for multi-tenant applications where you want to provide common defaults while allowing tenant-specific customizations.

## Features

- **Client Fallbacks**: Merge web origins, logout URLs, callbacks, and tenant properties from a main client
- **Connection Fallbacks**: Merge connection options from main tenant connections, allowing tenant-specific overrides
- **Transparent Wrapping**: Works with any existing data adapter implementation
- **Selective Fallbacks**: Only applies fallbacks when main tenant/client IDs are configured

## Usage

### Basic Setup

```typescript
import { init, withMainTenantFallback } from "@authhero/authhero";
import createAdapters from "@authhero/kysely";

// Create your base data adapters
const db = // ... your database connection
const baseAdapters = createAdapters(db);

// Wrap with main tenant fallback functionality
const adapters = withMainTenantFallback(baseAdapters, {
  mainTenantId: "main",      // Optional: main tenant for connection defaults
  mainClientId: "main-client" // Optional: main client for client defaults
});

// Initialize AuthHero with the wrapped adapters
const app = init({
  dataAdapter: adapters
});
```

## How It Works

### Client Fallbacks

When retrieving a client, the adapter:

1. Fetches the requested client
2. Fetches the main client (if configured)
3. Merges arrays like `web_origins`, `allowed_logout_urls`, and `callbacks`
4. Merges tenant properties (main tenant properties as defaults, client tenant properties take precedence)
5. Handles connection fallbacks for all tenant connections

### Connection Fallbacks

When retrieving connections, the adapter:

1. Fetches the tenant's connections
2. Fetches the main tenant's connections (if configured)
3. For each tenant connection, finds a matching main tenant connection by name
4. Merges connection options (main tenant options as defaults, tenant options take precedence)

### Example Fallback Behavior

**Main tenant connection:**

```json
{
  "name": "email",
  "strategy": "email",
  "options": {
    "from": "noreply@maincompany.com",
    "api_key": "default-api-key",
    "template": "default-template"
  }
}
```

**Tenant connection:**

```json
{
  "name": "email",
  "strategy": "email",
  "options": {
    "from": "noreply@tenant.com"
    // api_key and template will be inherited from main tenant
  }
}
```

**Merged result:**

```json
{
  "name": "email",
  "strategy": "email",
  "options": {
    "from": "noreply@tenant.com", // tenant value takes precedence
    "api_key": "default-api-key", // inherited from main tenant
    "template": "default-template" // inherited from main tenant
  }
}
```

## Migration from Manual Fallbacks

If you were previously using the manual fallback logic in `getClientWithDefaults`, you can now:

1. Set up the main tenant adapter with your main tenant/client IDs
2. Remove the manual fallback logic from your client helpers
3. The adapter will automatically handle all fallbacks transparently

The `getClientWithDefaults` function has been simplified to only add the required universal login URLs, as all other fallback logic is now handled by the adapter.

## Performance Notes

- Fallback lookups are only performed when main tenant/client IDs are configured
- The adapter maintains the same interface as the base adapters, so there's no performance impact on operations that don't need fallbacks
- Connection merging happens at the adapter level, reducing duplicate database queries

## Compatibility

The Main Tenant Adapter is compatible with any data adapter that implements the `DataAdapters` interface from `@authhero/adapter-interfaces`. This includes:

- `@authhero/kysely`
- `@authhero/drizzle`
- Custom adapter implementations
