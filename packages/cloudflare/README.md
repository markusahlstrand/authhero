# @authhero/cloudflare-adapter

Cloudflare-specific adapters for AuthHero, providing integrations with Cloudflare services.

## Features

This package provides adapters for:

- **Custom Domains** - Manage custom domains via Cloudflare API
- **Cache** - Caching using Cloudflare's Cache API
- **Geo** (optional) - Extract geographic information from Cloudflare request headers
- **Logs** (optional) - Two options for authentication logs:
  - **Analytics Engine** - Low-latency writes with SQL querying (90-day retention)
  - **R2 SQL + Pipelines** - Long-term storage with unlimited retention

## Installation

```bash
npm install @authhero/cloudflare-adapter
```

## Usage

### With Analytics Engine Logs (Recommended for Workers)

```typescript
import createAdapters from "@authhero/cloudflare-adapter";

// In a Cloudflare Worker
interface Env {
  AUTH_LOGS: AnalyticsEngineDataset;
  CLOUDFLARE_ACCOUNT_ID: string;
  ANALYTICS_ENGINE_API_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const adapters = createAdapters({
      // Custom domains configuration
      zoneId: "your-cloudflare-zone-id",
      authKey: "your-cloudflare-api-key",
      authEmail: "your-cloudflare-email",
      customDomainAdapter: yourDatabaseCustomDomainsAdapter,

      // Analytics Engine logs (low latency writes)
      analyticsEngineLogs: {
        analyticsEngineBinding: env.AUTH_LOGS,
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
      },
    });

    const { customDomains, cache, geo, logs } = adapters;
    // ...
  },
};
```

### With R2 SQL Logs (HTTP Endpoint Mode)

```typescript
import createAdapters from "@authhero/cloudflare-adapter";

const adapters = createAdapters({
  // Custom domains configuration
  zoneId: "your-cloudflare-zone-id",
  authKey: "your-cloudflare-api-key",
  authEmail: "your-cloudflare-email",
  customDomainAdapter: yourDatabaseCustomDomainsAdapter,

  // Cache configuration (optional)
  cacheName: "default",
  defaultTtlSeconds: 3600,
  keyPrefix: "authhero:",

  // Geo adapter configuration (optional) - automatically included when getHeaders is provided
  getHeaders: () => {
    // In Cloudflare Workers, you'd typically pass request headers
    // Cloudflare automatically adds cf-ipcountry, cf-ipcity, etc.
    return request.headers;
  },

  // R2 SQL logs configuration (optional) - HTTP mode
  r2SqlLogs: {
    pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
    authToken: process.env.R2_SQL_AUTH_TOKEN,
    warehouseName: process.env.R2_WAREHOUSE_NAME,
    namespace: "default",
    tableName: "logs",
  },
});

// Use the adapters
const { customDomains, cache, geo, logs } = adapters;
```

### Service Binding Mode (Cloudflare Workers)

```typescript
interface Env {
  PIPELINE_SERVICE: { fetch: typeof fetch };
  R2_SQL_AUTH_TOKEN: string;
  R2_WAREHOUSE_NAME: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const adapters = createAdapters({
      zoneId: "your-cloudflare-zone-id",
      authKey: "your-cloudflare-api-key",
      authEmail: "your-cloudflare-email",
      customDomainAdapter: yourDatabaseCustomDomainsAdapter,

      // Geo adapter - extract location from Cloudflare headers
      getHeaders: () => Object.fromEntries(request.headers),

      // R2 SQL logs with service binding
      r2SqlLogs: {
        pipelineBinding: env.PIPELINE_SERVICE,
        authToken: env.R2_SQL_AUTH_TOKEN,
        warehouseName: env.R2_WAREHOUSE_NAME,
      },
    });

    // Use adapters.logs and adapters.geo
  },
};
```

### Passthrough Mode (Multiple Destinations)

Use the core `createPassthroughAdapter` utility to sync logs to multiple destinations:

```typescript
import { createPassthroughAdapter } from "@authhero/adapter-interfaces";
import createAdapters, {
  createR2SQLLogsAdapter,
  createAnalyticsEngineLogsAdapter,
} from "@authhero/cloudflare-adapter";

// Primary adapter (e.g., existing database)
const databaseAdapter = createDatabaseLogsAdapter();

// Cloudflare logs adapters for secondary syncing
const r2SqlAdapter = createR2SQLLogsAdapter({
  pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
  authToken: process.env.R2_SQL_AUTH_TOKEN,
  warehouseName: process.env.R2_WAREHOUSE_NAME,
});

const analyticsEngineAdapter = createAnalyticsEngineLogsAdapter({
  analyticsEngineBinding: env.AUTH_LOGS,
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
});

// Create passthrough adapter - writes to primary and all secondaries
const logsAdapter = createPassthroughAdapter({
  primary: databaseAdapter,
  secondaries: [
    { adapter: { create: r2SqlAdapter.create } },
    { adapter: { create: analyticsEngineAdapter.create } },
  ],
});

// logsAdapter.create() writes to database, R2 SQL Pipeline, and Analytics Engine
// logsAdapter.get() and logsAdapter.list() read from database only
```

## Adapters

### Custom Domains Adapter

Manages custom domains through the Cloudflare API.

#### Configuration

```typescript
{
  zoneId: string;              // Your Cloudflare zone ID
  authKey: string;             // Your Cloudflare API key
  authEmail: string;           // Your Cloudflare account email
  enterprise?: boolean;        // Whether using Cloudflare Enterprise (default: false)
  customDomainAdapter: CustomDomainsAdapter; // Database adapter for storing domain data
}
```

#### Methods

- `create(tenantId, domain)` - Create a custom domain
- `get(tenantId, domainId)` - Get a custom domain
- `getByDomain(domain)` - Get domain by domain name
- `list(tenantId, params)` - List custom domains
- `remove(tenantId, domainId)` - Remove a custom domain
- `update(tenantId, domainId, data)` - Update a custom domain

### Cache Adapter

Provides caching using Cloudflare's Cache API.

#### Configuration

```typescript
{
  cacheName?: string;          // Cache name (default: "default")
  defaultTtlSeconds?: number;  // Default TTL in seconds (default: undefined)
  keyPrefix?: string;          // Key prefix for namespacing (default: undefined)
}
```

#### Methods

- `get<T>(key)` - Get a value from cache
- `set<T>(key, value, ttl?)` - Set a value in cache with optional TTL
- `delete(key)` - Delete a value from cache

#### Example

```typescript
// Set a value with 1 hour TTL
await cache.set("user:123", userData, 3600);

// Get a value
const user = await cache.get("user:123");

// Delete a value
await cache.delete("user:123");
```

### Logs Adapter (R2 SQL + Pipelines)

Write authentication logs to Cloudflare R2 using Pipelines for ingestion and R2 SQL for querying.

#### Architecture

This adapter uses two Cloudflare services:

- **Pipelines**: HTTP endpoint for ingesting log data into R2
- **R2 SQL**: Query interface for analyzing logs stored in Apache Iceberg format

#### Prerequisites

1. **Create an R2 bucket and enable R2 Data Catalog**:

```bash
npx wrangler r2 bucket create my-authhero-logs
npx wrangler r2 bucket catalog enable my-authhero-logs
```

Note the "Warehouse" name from the output - you'll need it later.

2. **Create an API token**

In the Cloudflare Dashboard:

- Go to R2 object storage
- Select "Manage API tokens"
- Create a token with Admin Read & Write permissions
- Save the token value

3. **Create a schema file** (`schema.json`):

```json
{
  "fields": [
    { "name": "tenant_id", "type": "string", "required": true },
    { "name": "type", "type": "string", "required": true },
    { "name": "date", "type": "string", "required": true },
    { "name": "description", "type": "string", "required": false },
    { "name": "ip", "type": "string", "required": false },
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
    { "name": "log_id", "type": "string", "required": true },
    { "name": "country_code", "type": "string", "required": false },
    { "name": "city_name", "type": "string", "required": false },
    { "name": "latitude", "type": "string", "required": false },
    { "name": "longitude", "type": "string", "required": false },
    { "name": "time_zone", "type": "string", "required": false },
    { "name": "continent_code", "type": "string", "required": false }
  ]
}
```

4. **Create a Pipeline**:

```bash
npx wrangler pipelines setup
```

Follow the prompts:

- **Pipeline name**: `authhero-logs`
- **Enable HTTP endpoint**: `yes`
- **Require authentication**: `no` (or `yes` if you want additional security)
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

#### Configuration

The R2 SQL logs adapter supports three usage modes:

##### 1. HTTP Endpoint Mode (Default)

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

##### 2. Pipeline Binding Mode (Workers)

Use this mode when running inside a Cloudflare Worker with a Pipeline binding. This is the most efficient mode as it uses direct bindings without HTTP overhead.

**wrangler.toml:**

```toml
[[pipelines]]
binding = "AUTH_LOGS_STREAM"
pipeline = "your-pipeline-id"
```

**TypeScript:**

```typescript
interface Env {
  AUTH_LOGS_STREAM: Pipeline;
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
        pipelineBinding: env.AUTH_LOGS_STREAM,
        authToken: env.R2_SQL_AUTH_TOKEN,
        warehouseName: env.R2_WAREHOUSE_NAME,
      },
    });

    const { logs } = adapters;
    // Use logs adapter
  },
};
```

The Pipeline binding uses the `.send()` method for direct data ingestion.

##### 3. Passthrough Mode (Wrap Another Adapter)

Use the core `createPassthroughAdapter` utility to send logs to both R2 SQL Pipeline and another logs adapter:

```typescript
import { createPassthroughAdapter } from "@authhero/adapter-interfaces";
import { createR2SQLLogsAdapter } from "@authhero/cloudflare-adapter";

// Primary adapter (e.g., existing database)
const databaseAdapter = createDatabaseLogsAdapter();

// R2 SQL Pipeline adapter
const r2SqlAdapter = createR2SQLLogsAdapter({
  pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
  authToken: env.R2_SQL_AUTH_TOKEN,
  warehouseName: env.R2_WAREHOUSE_NAME,
});

// Create passthrough adapter
const logsAdapter = createPassthroughAdapter({
  primary: databaseAdapter,
  secondaries: [
    {
      adapter: { create: r2SqlAdapter.create },
      onError: (err) => console.error("R2 SQL sync failed:", err),
    },
  ],
});
```

In passthrough mode:

- `create()` calls the primary adapter first, then sends to secondaries in the background
- `get()` and `list()` read from the primary adapter only
- Secondary errors are logged but don't fail the operation

#### Methods

- `create(tenantId, log)` - Create a log entry (sends to Pipeline)
- `get(tenantId, logId)` - Get a log entry (queries R2 SQL)
- `list(tenantId, params)` - List logs with pagination and filtering (queries R2 SQL)

#### Example

```typescript
// Create a log
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
```

#### Querying Logs with R2 SQL

You can query logs directly using the Wrangler CLI:

```bash
# Set up authentication
export WRANGLER_R2_SQL_AUTH_TOKEN=your_api_token

# Query logs
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
```

### Logs Adapter (Analytics Engine)

Write authentication logs to Cloudflare Workers Analytics Engine for low-latency writes and SQL-based querying.

#### Architecture

This adapter uses Cloudflare's Workers Analytics Engine:

- **Write**: Fire-and-forget writes using `writeDataPoint()` (no HTTP latency)
- **Query**: SQL API for analyzing logs stored in Analytics Engine

#### When to Use Analytics Engine vs R2 SQL

| Feature        | Analytics Engine                 | R2 SQL + Pipelines            |
| -------------- | -------------------------------- | ----------------------------- |
| Write Latency  | ~0ms (fire-and-forget)           | ~50-100ms (HTTP)              |
| Data Retention | 90 days (free), configurable     | Unlimited                     |
| Query Language | SQL (ClickHouse-like)            | SQL (Iceberg)                 |
| Best For       | Real-time analytics, recent logs | Long-term storage, compliance |
| Pricing        | Free tier available              | Pay per storage + queries     |

#### Prerequisites

1. **Create an Analytics Engine Dataset**:

Configure in `wrangler.toml`:

```toml
[[analytics_engine_datasets]]
binding = "AUTH_LOGS"
dataset = "authhero_logs"
```

2. **Create an API Token**:

Create a Cloudflare API token with `Account Analytics: Read` permission for querying logs.

#### Configuration

```typescript
interface AnalyticsEngineLogsAdapterConfig {
  // Analytics Engine dataset binding (for Workers)
  analyticsEngineBinding?: AnalyticsEngineDataset;

  // Cloudflare account ID (required for SQL queries)
  accountId: string;

  // API token with Analytics Engine read permission
  apiToken: string;

  // Dataset name (default: "authhero_logs")
  dataset?: string;

  // HTTP timeout in ms (default: 30000)
  timeout?: number;
}
```

#### Usage

```typescript
import createAdapters, {
  createAnalyticsEngineLogsAdapter,
} from "@authhero/cloudflare-adapter";

// Option 1: Use via createAdapters
const adapters = createAdapters({
  zoneId: "your-zone-id",
  authKey: "your-api-key",
  authEmail: "your-email",
  customDomainAdapter: yourDbAdapter,

  analyticsEngineLogs: {
    analyticsEngineBinding: env.AUTH_LOGS,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
    dataset: "authhero_logs",
  },
});

// Option 2: Use adapter directly
const logsAdapter = createAnalyticsEngineLogsAdapter({
  analyticsEngineBinding: env.AUTH_LOGS,
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
});
```

#### Worker Example

```typescript
interface Env {
  AUTH_LOGS: AnalyticsEngineDataset;
  CLOUDFLARE_ACCOUNT_ID: string;
  ANALYTICS_ENGINE_API_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const { logs } = createAdapters({
      // ... other config
      analyticsEngineLogs: {
        analyticsEngineBinding: env.AUTH_LOGS,
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
      },
    });

    // Write a log (fire-and-forget, no await needed)
    await logs.create("tenant-123", {
      type: "s",
      date: new Date().toISOString(),
      ip: request.headers.get("cf-connecting-ip") || "",
      user_agent: request.headers.get("user-agent") || "",
      isMobile: false,
      user_id: "user-456",
      description: "User logged in",
    });

    // Query logs
    const recentLogs = await logs.list("tenant-123", {
      per_page: 50,
      q: "type:s",
    });

    return new Response("OK");
  },
};
```

#### Passthrough Mode

Use Analytics Engine alongside another logs adapter using the core `createPassthroughAdapter` utility:

```typescript
import { createPassthroughAdapter } from "@authhero/adapter-interfaces";
import { createAnalyticsEngineLogsAdapter } from "@authhero/cloudflare-adapter";

// Primary adapter (e.g., database)
const databaseAdapter = createDatabaseLogsAdapter();

// Analytics Engine adapter for write syncing
const analyticsEngineAdapter = createAnalyticsEngineLogsAdapter({
  analyticsEngineBinding: env.AUTH_LOGS,
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
});

// Create passthrough adapter - writes to both, reads from primary
const logsAdapter = createPassthroughAdapter({
  primary: databaseAdapter,
  secondaries: [
    {
      adapter: { create: analyticsEngineAdapter.create },
      onError: (err) => console.error("Analytics sync failed:", err),
    },
  ],
});

// logs.create() writes to both adapters (database first, then Analytics Engine)
// logs.get() and logs.list() read from database only
```

#### Data Schema

Analytics Engine stores logs using blob and double fields:

| Field     | Type   | Description                              |
| --------- | ------ | ---------------------------------------- |
| blob1     | string | log_id                                   |
| blob2     | string | tenant_id                                |
| blob3     | string | type (e.g., "s", "f")                    |
| blob4     | string | date (ISO string)                        |
| blob5     | string | description                              |
| blob6     | string | ip                                       |
| blob7     | string | user_agent                               |
| blob8-18  | string | user_id, connection, client_id, etc.     |
| blob19-20 | string | JSON stringified (details, auth0_client) |
| double1   | number | isMobile (0 or 1)                        |
| double2   | number | timestamp (epoch ms)                     |
| index1    | string | tenant_id (for efficient filtering)      |

#### Querying with SQL API

```bash
# List recent logs for a tenant
curl "https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "SELECT * FROM authhero_logs WHERE index1 = 'tenant-123' ORDER BY timestamp DESC LIMIT 50"

# Count logins by type
curl "https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "SELECT blob3 as type, count() as count FROM authhero_logs WHERE index1 = 'tenant-123' GROUP BY blob3"
```

## Geo Adapter

The Cloudflare Geo adapter extracts geographic location information from Cloudflare's automatic request headers. This is used to enrich authentication logs with location data.

### Features

- **Zero Latency**: Uses headers already provided by Cloudflare
- **No API Calls**: No external services or databases required
- **Graceful Degradation**: Works with just country code or full location data
- **Free**: All features available on Cloudflare's free plan

### Cloudflare Setup

The geo adapter requires specific Cloudflare settings to be enabled:

#### 1. Enable IP Geolocation (Required)

This provides the `cf-ipcountry` header with just the country code.

1. Go to your Cloudflare dashboard
2. Navigate to **Network** settings
3. Enable **IP Geolocation**

#### 2. Enable "Add visitor location headers" Managed Transform (Recommended)

This provides full location data including city, coordinates, timezone, etc.

1. Go to your Cloudflare dashboard
2. Navigate to **Rules** > **Transform Rules** > **Managed Transforms**
3. Enable **Add visitor location headers**

This is a **free feature** available on all Cloudflare plans.

### Configuration

The geo adapter is automatically included when you create the Cloudflare adapters. Headers are passed at request time via `getGeoInfo(headers)`:

```typescript
import createAdapters from "@authhero/cloudflare-adapter";

// Create adapters once at startup
const adapters = createAdapters({
  // ... other config
});

// The geo adapter is always available
// Headers are passed when calling getGeoInfo
const headers = Object.fromEntries(request.headers);
const geoInfo = await adapters.geo.getGeoInfo(headers);
```

When used with AuthHero, headers are automatically extracted from the Hono context in the logging helper.

### Cloudflare Headers Used

| Header           | Description               | Example               | Availability                         |
| ---------------- | ------------------------- | --------------------- | ------------------------------------ |
| `cf-ipcountry`   | 2-letter ISO country code | `US`                  | Always (with IP Geolocation enabled) |
| `cf-ipcity`      | City name                 | `San Francisco`       | With Managed Transform               |
| `cf-iplatitude`  | Latitude coordinate       | `37.7749`             | With Managed Transform               |
| `cf-iplongitude` | Longitude coordinate      | `-122.4194`           | With Managed Transform               |
| `cf-timezone`    | IANA timezone identifier  | `America/Los_Angeles` | With Managed Transform               |
| `cf-ipcontinent` | 2-letter continent code   | `NA`                  | With Managed Transform               |

Additional headers available with Managed Transform (not currently mapped):

- `cf-region`: Region name
- `cf-region-code`: Region code
- `cf-metro-code`: Metro code
- `cf-postal-code`: Postal code

### Response Format

```typescript
interface GeoInfo {
  country_code: string; // "US" - always available
  city_name: string; // "San Francisco" or "" if not available
  latitude: string; // "37.7749" or "" if not available
  longitude: string; // "-122.4194" or "" if not available
  time_zone: string; // "America/Los_Angeles" or "" if not available
  continent_code: string; // "NA" or "" if not available
}
```

**With only IP Geolocation enabled:**

```json
{
  "country_code": "US",
  "city_name": "",
  "latitude": "",
  "longitude": "",
  "time_zone": "",
  "continent_code": ""
}
```

**With "Add visitor location headers" Managed Transform enabled:**

```json
{
  "country_code": "US",
  "city_name": "San Francisco",
  "latitude": "37.7749",
  "longitude": "-122.4194",
  "time_zone": "America/Los_Angeles",
  "continent_code": "NA"
}
```

### Integration with AuthHero

When configured in AuthHero, the geo adapter automatically enriches authentication logs. The logging helper extracts headers from the Hono context automatically:

```typescript
import createAdapters from "@authhero/cloudflare-adapter";

const cloudflareAdapters = createAdapters({
  // ... other config
});

const dataAdapter = {
  ...yourDatabaseAdapter,
  geo: cloudflareAdapters.geo, // Add geo adapter
};
```

Logs will automatically include `location_info`:

```json
{
  "type": "s",
  "date": "2025-11-28T12:00:00.000Z",
  "location_info": {
    "country_code": "US",
    "city_name": "San Francisco",
    "latitude": "37.7749",
    "longitude": "-122.4194",
    "time_zone": "America/Los_Angeles",
    "continent_code": "NA"
  }
}
```

### Alternative: IP Geolocation Databases

If you're not using Cloudflare or need more detailed location data, you can implement a custom `GeoAdapter` using IP geolocation databases like MaxMind GeoIP2:

```typescript
import maxmind from "maxmind";
import { GeoAdapter, GeoInfo } from "@authhero/adapter-interfaces";

class MaxMindGeoAdapter implements GeoAdapter {
  private reader: maxmind.Reader<maxmind.CityResponse>;

  private constructor(reader: maxmind.Reader<maxmind.CityResponse>) {
    this.reader = reader;
  }

  static async create(databasePath: string): Promise<MaxMindGeoAdapter> {
    const reader = await maxmind.open<maxmind.CityResponse>(databasePath);
    return new MaxMindGeoAdapter(reader);
  }

  async getGeoInfo(headers: Record<string, string>): Promise<GeoInfo | null> {
    // Extract IP from headers (e.g., x-forwarded-for, cf-connecting-ip)
    const ip =
      headers["cf-connecting-ip"] ||
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      headers["x-real-ip"];

    if (!ip) return null;

    const lookup = this.reader.get(ip);

    if (!lookup) return null;

    return {
      country_code: lookup.country?.iso_code || "",
      city_name: lookup.city?.names?.en || "",
      latitude: lookup.location?.latitude?.toString() || "",
      longitude: lookup.location?.longitude?.toString() || "",
      time_zone: lookup.location?.time_zone || "",
      continent_code: lookup.continent?.code || "",
    };
  }
}

// Usage:
const geoAdapter = await MaxMindGeoAdapter.create(
  "/path/to/GeoLite2-City.mmdb",
);
```

**Considerations for IP Databases**:

- Requires database downloads and regular updates
- Additional latency for lookups (1-5ms typically)
- May require licensing fees
- Works in any environment, not just edge platforms

## Environment Variables

Recommended environment variables:

```env
# Custom Domains
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_AUTH_KEY=your_api_key
CLOUDFLARE_AUTH_EMAIL=your_email

# R2 SQL Logs (optional)
PIPELINE_ENDPOINT=https://your-stream-id.ingest.cloudflare.com
R2_SQL_AUTH_TOKEN=your_r2_sql_token
R2_WAREHOUSE_NAME=your_warehouse_name
```

## TypeScript

The package includes TypeScript definitions. Import types as needed:

```typescript
import type {
  CloudflareConfig,
  CloudflareAdapters,
  R2SQLLogsAdapterConfig,
} from "@authhero/cloudflare-adapter";
```

## Related Documentation

- [Cloudflare API](https://developers.cloudflare.com/api/)
- [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Cloudflare R2 SQL](https://developers.cloudflare.com/r2-sql/)
- [R2 Data Catalog](https://developers.cloudflare.com/r2/data-catalog/)

## License

MIT
