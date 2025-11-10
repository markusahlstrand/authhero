# Cloudflare Adapter

The Cloudflare adapter provides Cloudflare-specific integrations for AuthHero, including custom domain management, caching, and optional R2 SQL logging.

## Features

- **Custom Domains**: Manage custom domains via Cloudflare API
- **Cache**: Cloudflare Cache API integration for high-performance caching
- **R2 SQL Logs** (optional): Write authentication logs to Cloudflare R2 SQL for analytics and auditing
- **Edge Compatible**: Works in Cloudflare Workers and standard Node.js environments
- **Global Distribution**: Leverage Cloudflare's global network

## Installation

```bash
npm install @authhero/cloudflare-adapter
```

## Configuration

### Basic Setup

```typescript
import createAdapters from "@authhero/cloudflare-adapter";

const adapters = createAdapters({
  // Custom domains configuration (required)
  zoneId: "your-cloudflare-zone-id",
  authKey: "your-cloudflare-api-key",
  authEmail: "your-cloudflare-email",
  customDomainAdapter: yourDatabaseCustomDomainsAdapter,

  // Cache configuration (optional)
  cacheName: "default",
  defaultTtlSeconds: 3600,
  keyPrefix: "authhero:",

  // R2 SQL logs configuration (optional)
  r2SqlLogs: {
    authToken: process.env.R2_SQL_AUTH_TOKEN,
    warehouseName: process.env.R2_WAREHOUSE_NAME,
    namespace: "default",
    tableName: "logs",
  },
});

// Use the adapters
const { customDomains, cache, logs } = adapters;
```

## Custom Domains Adapter

Manages custom domains through the Cloudflare API, handling SSL certificates and DNS configuration automatically.

### Configuration

```typescript
{
  zoneId: string;              // Your Cloudflare zone ID
  authKey: string;             // Your Cloudflare API key
  authEmail: string;           // Your Cloudflare account email
  enterprise?: boolean;        // Whether using Cloudflare Enterprise (default: false)
  customDomainAdapter: CustomDomainsAdapter; // Database adapter for storing domain data
}
```

### Methods

The custom domains adapter provides the following methods:

- `create(tenantId, domain)` - Create a custom domain
- `get(tenantId, domainId)` - Get a custom domain by ID
- `getByDomain(domain)` - Get a custom domain by domain name
- `list(tenantId, params)` - List custom domains with pagination
- `remove(tenantId, domainId)` - Remove a custom domain
- `update(tenantId, domainId, data)` - Update a custom domain

### Usage Example

```typescript
// Create a custom domain
const domain = await customDomains.create("tenant-123", {
  domain: "auth.example.com",
  // Additional configuration...
});

// Get domain by name
const existingDomain = await customDomains.getByDomain("auth.example.com");

// List all domains for a tenant
const { domains, total } = await customDomains.list("tenant-123", {
  page: 0,
  per_page: 10,
});

// Remove a domain
await customDomains.remove("tenant-123", "domain-id-456");
```

## Cache Adapter

Provides caching using Cloudflare's Cache API for high-performance data storage.

### Configuration

```typescript
{
  cacheName?: string;          // Cache name (default: "default")
  defaultTtlSeconds?: number;  // Default TTL in seconds
  keyPrefix?: string;          // Key prefix for namespacing
}
```

### Methods

- `get<T>(key: string)` - Get a value from cache
- `set<T>(key: string, value: T, ttl?: number)` - Set a value with optional TTL
- `delete(key: string)` - Delete a value from cache

### Usage Example

```typescript
// Cache user data
await cache.set("user:123", userData, 3600); // Cache for 1 hour

// Retrieve from cache
const user = await cache.get<User>("user:123");

// Delete from cache
await cache.delete("user:123");

// Use with key prefix
const prefixedCache = createAdapters({
  // ... other config
  keyPrefix: "authhero:",
});

// This will store as "authhero:user:123"
await prefixedCache.cache.set("user:123", userData);
```

### Caching Strategy Example

```typescript
async function getUserWithCache(userId: string, tenantId: string) {
  const cacheKey = `user:${userId}:${tenantId}`;

  // Try cache first
  let user = await cache.get<User>(cacheKey);

  if (!user) {
    // Fetch from database
    user = await database.users.get(userId, tenantId);

    // Cache for 5 minutes
    await cache.set(cacheKey, user, 300);
  }

  return user;
}
```

## R2 SQL Logs Adapter

Write authentication logs to Cloudflare R2 using Pipelines for data ingestion and R2 SQL for querying.

### Architecture

This adapter uses two Cloudflare services:

- **Pipelines**: HTTP endpoint for ingesting log data into R2 Data Catalog
- **R2 SQL**: Query interface for analyzing logs stored in Apache Iceberg format

Data flow:

1. Log data is sent to Pipeline HTTP endpoint → 2. Pipeline writes to R2 in Iceberg format → 3. R2 SQL queries the Iceberg table

### Prerequisites

1. **Create R2 Bucket and Enable Data Catalog**

```bash
# Create an R2 bucket
npx wrangler r2 bucket create my-authhero-logs

# Enable R2 Data Catalog
npx wrangler r2 bucket catalog enable my-authhero-logs
```

**Important**: Note the "Warehouse" name from the output - you'll need it later.

2. **Create API Token**

In the Cloudflare Dashboard:

- Go to R2 object storage
- Select "Manage API tokens"
- Create a token with Admin Read & Write permissions
- Save the token value

3. **Create Schema File**

Create a file named `schema.json`:

```json
{
  "fields": [
    { "name": "id", "type": "string", "required": true },
    { "name": "tenant_id", "type": "string", "required": true },
    { "name": "type", "type": "string", "required": true },
    { "name": "date", "type": "string", "required": true },
    { "name": "description", "type": "string", "required": false },
    { "name": "ip", "type": "string", "required": true },
    { "name": "user_agent", "type": "string", "required": true },
    { "name": "details", "type": "string", "required": false },
    { "name": "isMobile", "type": "int64", "required": false },
    { "name": "user_id", "type": "string", "required": false },
    { "name": "user_name", "type": "string", "required": false },
    { "name": "connection", "type": "string", "required": false },
    { "name": "connection_id", "type": "string", "required": false },
    { "name": "client_id", "type": "string", "required": false },
    { "name": "client_name", "type": "string", "required": false },
    { "name": "audience", "type": "string", "required": false },
    { "name": "scope", "type": "string", "required": false },
    { "name": "strategy", "type": "string", "required": false },
    { "name": "strategy_type", "type": "string", "required": false },
    { "name": "hostname", "type": "string", "required": false },
    { "name": "auth0_client", "type": "string", "required": false },
    { "name": "log_id", "type": "string", "required": true }
  ]
}
```

4. **Create a Pipeline**

Run the interactive setup:

```bash
npx wrangler pipelines setup
```

Follow the prompts:

- **Pipeline name**: `authhero-logs`
- **Enable HTTP endpoint**: `yes`
- **Require authentication**: `no` (or `yes` for additional security)
- **Configure custom CORS origins**: `no`
- **Schema definition**: `Load from file`
- **Schema file path**: `schema.json`
- **Destination type**: `Data Catalog Table`
- **R2 bucket name**: `my-authhero-logs`
- **Namespace**: `default`
- **Table name**: `logs`
- **Catalog API token**: Enter your token from step 2
- **Compression**: `zstd`
- **Roll file when size reaches (MB)**: `100`
- **Roll file when time reaches (seconds)**: `300` (5 minutes)
- **SQL transformation**: `Use simple ingestion query`

**Important**: Save the HTTP endpoint URL from the output (e.g., `https://abc123.ingest.cloudflare.com`)

### Configuration

The R2 SQL logs adapter supports three operational modes:

#### 1. HTTP Endpoint Mode (Default)

Use this mode when calling the Pipeline from outside a Cloudflare Worker:

```typescript
{
  pipelineEndpoint: string;    // Pipeline HTTP endpoint URL for ingesting logs
  authToken: string;           // R2 SQL API token for querying logs
  warehouseName: string;       // R2 warehouse name
  namespace?: string;          // Catalog namespace (default: "default")
  tableName?: string;          // Table name (default: "logs")
  apiBaseUrl?: string;         // R2 SQL API base URL
  timeout?: number;            // HTTP timeout in ms (default: 30000)
}
```

**Example:**

```typescript
const adapters = createAdapters({
  zoneId: "your-zone-id",
  authKey: "your-api-key",
  authEmail: "your-email",
  customDomainAdapter: yourDbAdapter,

  r2SqlLogs: {
    pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
    authToken: process.env.R2_SQL_AUTH_TOKEN,
    warehouseName: process.env.R2_WAREHOUSE_NAME,
  },
});
```

#### 2. Service Binding Mode (Cloudflare Workers)

Use this mode when running inside a Cloudflare Worker with a service binding to the Pipeline. This is more efficient as it avoids HTTP overhead for Worker-to-Worker communication.

**wrangler.toml:**

```toml
[[pipelines]]
binding = "PIPELINE_SERVICE"
pipeline = "my-pipeline"
```

**TypeScript:**

```typescript
interface Env {
  PIPELINE_SERVICE: { fetch: typeof fetch };
  R2_SQL_AUTH_TOKEN: string;
  R2_WAREHOUSE_NAME: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const adapters = createAdapters({
      zoneId: "your-zone-id",
      authKey: "your-api-key",
      authEmail: "your-email",
      customDomainAdapter: yourDbAdapter,

      r2SqlLogs: {
        pipelineBinding: env.PIPELINE_SERVICE,
        authToken: env.R2_SQL_AUTH_TOKEN,
        warehouseName: env.R2_WAREHOUSE_NAME,
      },
    });

    const { logs } = adapters;
    // Use logs adapter
  },
};
```

#### 3. Passthrough Mode (Multiple Destinations)

Use this mode to send logs to both the R2 SQL Pipeline and another logs adapter. This is useful when you want to maintain compatibility with an existing logging system while also ingesting into R2.

```typescript
{
  baseAdapter: LogsDataAdapter;  // Base adapter to wrap
  pipelineEndpoint?: string;     // Pipeline HTTP endpoint (optional if using binding)
  pipelineBinding?: object;      // Pipeline service binding (optional if using endpoint)
  authToken?: string;            // R2 SQL API token (optional when using baseAdapter)
  warehouseName?: string;        // R2 warehouse name (optional when using baseAdapter)
}
```

**Example:**

```typescript
import { createOtherLogsAdapter } from "some-package";

const baseAdapter = createOtherLogsAdapter();

const adapters = createAdapters({
  zoneId: "your-zone-id",
  authKey: "your-api-key",
  authEmail: "your-email",
  customDomainAdapter: yourDbAdapter,

  r2SqlLogs: {
    baseAdapter,
    pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
    // authToken and warehouseName not needed when using baseAdapter
  },
});

// logs.create() will write to both baseAdapter and Pipeline
// logs.get() and logs.list() will read from baseAdapter
const { logs } = adapters;
```

**Passthrough Mode Behavior:**

- `create()`: Calls the base adapter first, then sends to the Pipeline in the background (non-blocking)
- `get()`: Delegated to the base adapter
- `list()`: Delegated to the base adapter
- Pipeline errors are logged but don't fail the operation

### Methods

- `create(tenantId, log)` - Create a log entry (sends to Pipeline endpoint)
- `get(tenantId, logId)` - Get a specific log entry (queries R2 SQL)
- `list(tenantId, params)` - List logs with pagination and filtering (queries R2 SQL)

### Usage Example

```typescript
// Create a log entry
const log = await logs.create("tenant-123", {
  type: "s", // Successful login
  date: new Date().toISOString(),
  ip: "192.168.1.100",
  user_agent: "Mozilla/5.0...",
  isMobile: false,
  user_id: "user-456",
  client_id: "app-789",
  description: "User logged in successfully",
});

// Get a specific log
const retrievedLog = await logs.get("tenant-123", "log-id-xyz");

// List logs with filtering
const result = await logs.list("tenant-123", {
  page: 0,
  per_page: 50,
  include_totals: true,
  sort: {
    sort_by: "date",
    sort_order: "desc",
  },
  q: "user_id:user-456", // Lucene-style filter
});

console.log(`Found ${result.length} logs`);
console.log(result.logs);
```

### Querying Logs with R2 SQL

You can query logs directly using the Wrangler CLI:

```bash
# Set up authentication
export WRANGLER_R2_SQL_AUTH_TOKEN=your_api_token

# Query recent successful logins
npx wrangler r2 sql query "your_warehouse" "
  SELECT * FROM default.logs
  WHERE tenant_id = 'tenant-123'
  AND type = 's'
  ORDER BY date DESC
  LIMIT 100
"

# Count logs by type
npx wrangler r2 sql query "your_warehouse" "
  SELECT type, COUNT(*) as count
  FROM default.logs
  WHERE tenant_id = 'tenant-123'
  GROUP BY type
"

# Find failed login attempts
npx wrangler r2 sql query "your_warehouse" "
  SELECT user_id, COUNT(*) as attempts, MAX(date) as last_attempt
  FROM default.logs
  WHERE tenant_id = 'tenant-123'
  AND type = 'f'
  GROUP BY user_id
  ORDER BY attempts DESC
"
```

### Analytics Example

```typescript
// Track login patterns
async function analyzeLoginPatterns(tenantId: string) {
  const logs = await logs.list(tenantId, {
    per_page: 1000,
    q: "type:s", // Successful logins only
  });

  const loginsByHour = {};
  logs.logs.forEach((log) => {
    const hour = new Date(log.date).getHours();
    loginsByHour[hour] = (loginsByHour[hour] || 0) + 1;
  });

  return loginsByHour;
}
```

## Environment Variables

Recommended environment variables for production:

```env
# Custom Domains
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_AUTH_KEY=your_api_key
CLOUDFLARE_AUTH_EMAIL=your_email
CLOUDFLARE_ENTERPRISE=false

# Cache (optional)
CACHE_NAME=default
CACHE_DEFAULT_TTL=3600
CACHE_KEY_PREFIX=authhero:

# R2 SQL Logs (optional)
PIPELINE_ENDPOINT=https://your-stream-id.ingest.cloudflare.com
R2_SQL_AUTH_TOKEN=your_r2_sql_token
R2_WAREHOUSE_NAME=your_warehouse_name
R2_SQL_NAMESPACE=default
R2_SQL_TABLE=logs
```

## TypeScript Support

The package includes full TypeScript definitions. Import types as needed:

```typescript
import type {
  CloudflareConfig,
  CloudflareAdapters,
  R2SQLLogsAdapterConfig,
} from "@authhero/cloudflare-adapter";

// Use in your configuration
const config: CloudflareConfig = {
  zoneId: process.env.CLOUDFLARE_ZONE_ID!,
  authKey: process.env.CLOUDFLARE_AUTH_KEY!,
  authEmail: process.env.CLOUDFLARE_AUTH_EMAIL!,
  customDomainAdapter: myAdapter,
  r2SqlLogs: {
    pipelineEndpoint: process.env.PIPELINE_ENDPOINT!,
    authToken: process.env.R2_SQL_AUTH_TOKEN!,
    warehouseName: process.env.R2_WAREHOUSE_NAME!,
  },
};

const adapters: CloudflareAdapters = createAdapters(config);
```

## Complete Integration Example

Here's a complete example integrating all three adapters:

```typescript
import createAdapters from "@authhero/cloudflare-adapter";
import { createKyselyAdapter } from "@authhero/kysely-adapter";

// Create database adapter for custom domains
const database = createKyselyAdapter(db);

// Create Cloudflare adapters
const cloudflareAdapters = createAdapters({
  // Custom domains
  zoneId: process.env.CLOUDFLARE_ZONE_ID!,
  authKey: process.env.CLOUDFLARE_AUTH_KEY!,
  authEmail: process.env.CLOUDFLARE_AUTH_EMAIL!,
  customDomainAdapter: database.customDomains,

  // Cache
  cacheName: "authhero-cache",
  defaultTtlSeconds: 3600,
  keyPrefix: "authhero:",

  // R2 SQL Logs
  r2SqlLogs: {
    pipelineEndpoint: process.env.PIPELINE_ENDPOINT!,
    authToken: process.env.R2_SQL_AUTH_TOKEN!,
    warehouseName: process.env.R2_WAREHOUSE_NAME!,
  },
});

// Use in your application
export const dataAdapters = {
  ...database,
  cache: cloudflareAdapters.cache,
  customDomains: cloudflareAdapters.customDomains,
  logs: cloudflareAdapters.logs,
};

// Example: Create custom domain with caching
async function createDomainWithCache(tenantId: string, domain: string) {
  // Create domain
  const newDomain = await dataAdapters.customDomains.create(tenantId, {
    domain,
    // ... other config
  });

  // Cache domain data
  await dataAdapters.cache.set(
    `domain:${domain}`,
    newDomain,
    3600, // Cache for 1 hour
  );

  // Log the action
  if (dataAdapters.logs) {
    await dataAdapters.logs.create(tenantId, {
      type: "api_operation",
      date: new Date().toISOString(),
      ip: "0.0.0.0",
      user_agent: "Server",
      isMobile: false,
      description: `Created custom domain: ${domain}`,
    });
  }

  return newDomain;
}
```

## Best Practices

### 1. Cache Strategy

Implement a layered caching strategy:

```typescript
async function getDataWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300,
): Promise<T> {
  // Try cache first
  const cached = await cache.get<T>(key);
  if (cached) return cached;

  // Fetch from source
  const data = await fetcher();

  // Cache for next time
  await cache.set(key, data, ttl);

  return data;
}

// Usage
const user = await getDataWithCache(
  `user:${userId}`,
  () => database.users.get(userId, tenantId),
  600, // 10 minutes
);
```

### 2. Error Handling

Implement proper error handling for all adapters:

```typescript
try {
  await customDomains.create(tenantId, domainData);
} catch (error) {
  // Log error
  if (logs) {
    await logs.create(tenantId, {
      type: "api_error",
      date: new Date().toISOString(),
      ip: request.ip,
      user_agent: request.headers["user-agent"],
      isMobile: false,
      description: `Failed to create domain: ${error.message}`,
      details: { error: error.stack },
    });
  }

  throw error;
}
```

### 3. Cache Invalidation

Clear cache when data changes:

```typescript
async function updateDomain(tenantId: string, domainId: string, updates: any) {
  // Update in database
  const updated = await customDomains.update(tenantId, domainId, updates);

  // Invalidate cache
  await cache.delete(`domain:${updated.domain}`);
  await cache.delete(`domain:${domainId}`);

  return updated;
}
```

### 4. Logging Strategy

Log important events for auditing:

```typescript
const LOG_TYPES = {
  DOMAIN_CREATED: "domain_created",
  DOMAIN_UPDATED: "domain_updated",
  DOMAIN_DELETED: "domain_deleted",
  CACHE_HIT: "cache_hit",
  CACHE_MISS: "cache_miss",
} as const;

async function logEvent(
  tenantId: string,
  type: string,
  description: string,
  metadata?: any,
) {
  if (!logs) return;

  await logs.create(tenantId, {
    type,
    date: new Date().toISOString(),
    ip: "0.0.0.0",
    user_agent: "Server",
    isMobile: false,
    description,
    details: metadata,
  });
}
```

## Performance Considerations

- **Cache TTL**: Set appropriate TTL based on data volatility
- **R2 SQL Queries**: Use WHERE clauses to filter by tenant_id for better performance
- **Batch Logging**: Consider batching log writes for high-volume scenarios
- **Connection Pooling**: Reuse HTTP connections when possible

## Troubleshooting

### Cache Issues

```typescript
// Clear all cache with prefix
async function clearCacheByPrefix(prefix: string) {
  // Note: Cloudflare Cache API doesn't support prefix clearing
  // You'll need to track keys separately or use a versioning strategy
  const version = (await cache.get<number>("cache:version")) || 0;
  await cache.set("cache:version", version + 1);
}
```

### R2 SQL Connection Issues

```typescript
// Test R2 SQL connection
async function testR2SQLConnection(config: R2SQLLogsAdapterConfig) {
  try {
    const testLog = await logs.create("test-tenant", {
      type: "test",
      date: new Date().toISOString(),
      ip: "0.0.0.0",
      user_agent: "Test",
      isMobile: false,
      description: "Connection test",
    });

    console.log("R2 SQL connection successful:", testLog.log_id);
    return true;
  } catch (error) {
    console.error("R2 SQL connection failed:", error.message);
    return false;
  }
}
```

## Related Documentation

- [Cloudflare API](https://developers.cloudflare.com/api/)
- [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Cloudflare R2 SQL](https://developers.cloudflare.com/r2-sql/)
- [R2 Data Catalog](https://developers.cloudflare.com/r2/data-catalog/)
- [AuthHero Adapter Interfaces](/adapters/interfaces/)

The Cloudflare adapter provides a flexible and performant solution for managing custom domains, caching, and logging in AuthHero applications.
