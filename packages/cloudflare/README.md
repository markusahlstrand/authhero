# @authhero/cloudflare-adapter

Cloudflare-specific adapters for AuthHero, providing integrations with Cloudflare services.

## Features

This package provides four adapters:

- **Custom Domains** - Manage custom domains via Cloudflare API
- **Cache** - Caching using Cloudflare's Cache API
- **Geo** (optional) - Extract geographic information from Cloudflare request headers
- **Logs** (optional) - Write authentication logs to Cloudflare R2 using Pipelines and query with R2 SQL

## Installation

```bash
npm install @authhero/cloudflare-adapter
```

## Usage

### HTTP Endpoint Mode (Default)

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

```typescript
import createAdapters from "@authhero/cloudflare-adapter";
import { createOtherLogsAdapter } from "some-package";

// Create a base logs adapter
const baseAdapter = createOtherLogsAdapter();

const adapters = createAdapters({
  zoneId: "your-cloudflare-zone-id",
  authKey: "your-cloudflare-api-key",
  authEmail: "your-cloudflare-email",
  customDomainAdapter: yourDatabaseCustomDomainsAdapter,

  // R2 SQL logs in passthrough mode - sends to both adapters
  r2SqlLogs: {
    baseAdapter,
    pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
    authToken: process.env.R2_SQL_AUTH_TOKEN,
    warehouseName: process.env.R2_WAREHOUSE_NAME,
  },
});

// logs.create() will write to baseAdapter and Pipeline
// logs.get() and logs.list() will read from baseAdapter
const { logs } = adapters;
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
    { "name": "id", "type": "string", "required": true },
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
    { "name": "country_code3", "type": "string", "required": false },
    { "name": "country_name", "type": "string", "required": false },
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

**With Base Adapter (Passthrough Mode):**

```typescript
const baseAdapter = createKyselyLogsAdapter(db);

const adapters = createAdapters({
  // ... other config
  r2SqlLogs: {
    baseAdapter, // Logs written to base adapter first
    pipelineBinding: env.AUTH_LOGS_STREAM, // Then sent to Pipeline in background
    // authToken and warehouseName not needed when using baseAdapter
  },
});
```

The Pipeline binding uses the `.send()` method for direct data ingestion.

##### 3. Passthrough Mode (Wrap Another Adapter)

Use this mode to send logs to both the R2 SQL Pipeline and another logs adapter:

```typescript
const baseAdapter = createSomeOtherLogsAdapter();

const { logs } = createAdapters({
  r2SqlLogs: {
    baseAdapter,
    pipelineEndpoint: "https://your-stream-id.ingest.cloudflare.com",
    authToken: env.R2_SQL_AUTH_TOKEN,
    warehouseName: env.R2_WAREHOUSE_NAME,
  },
});
```

In passthrough mode:

- `create()` calls the base adapter first, then sends to the Pipeline in the background
- `get()` and `list()` are delegated to the base adapter
- Pipeline ingestion errors are logged but don't fail the operation

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

## Geo Adapter

The Cloudflare Geo adapter extracts geographic location information from Cloudflare's automatic request headers. This is used to enrich authentication logs with location data.

### Features

- **Zero Latency**: Uses headers already provided by Cloudflare Workers
- **No API Calls**: No external services or databases required
- **Comprehensive Data**: Includes country, city, coordinates, timezone, and continent
- **Automatic**: Cloudflare populates headers automatically for every request

### Configuration

The geo adapter is automatically created when you provide the `getHeaders` function:

```typescript
const adapters = createAdapters({
  // ... other config
  getHeaders: () => Object.fromEntries(request.headers),
});

// Access the geo adapter
const geoInfo = await adapters.geo?.getGeoInfo();
```

### Cloudflare Headers Used

The adapter reads these Cloudflare-provided headers:

| Header           | Description               | Example               |
| ---------------- | ------------------------- | --------------------- |
| `cf-ipcountry`   | 2-letter ISO country code | `US`                  |
| `cf-ipcity`      | City name                 | `San Francisco`       |
| `cf-iplatitude`  | Latitude coordinate       | `37.7749`             |
| `cf-iplongitude` | Longitude coordinate      | `-122.4194`           |
| `cf-timezone`    | IANA timezone identifier  | `America/Los_Angeles` |
| `cf-ipcontinent` | 2-letter continent code   | `NA`                  |

### Response Format

```typescript
interface GeoInfo {
  country_code: string; // "US"
  country_code3: string; // "USA"
  country_name: string; // "United States"
  city_name: string; // "San Francisco"
  latitude: string; // "37.7749"
  longitude: string; // "-122.4194"
  time_zone: string; // "America/Los_Angeles"
  continent_code: string; // "NA"
}
```

### Integration with AuthHero

When configured in AuthHero, the geo adapter automatically enriches authentication logs:

```typescript
import { init } from "@authhero/authhero";
import createAdapters from "@authhero/cloudflare-adapter";

const cloudflareAdapters = createAdapters({
  getHeaders: () => Object.fromEntries(request.headers),
  // ... other config
});

const authhero = init({
  data: yourDatabaseAdapter,
  geo: cloudflareAdapters.geo, // Add geo adapter
  // ... other config
});
```

Logs will automatically include `location_info`:

```json
{
  "type": "s",
  "date": "2025-11-28T12:00:00.000Z",
  "location_info": {
    "country_code": "US",
    "country_code3": "USA",
    "country_name": "United States",
    "city_name": "San Francisco",
    "latitude": "37.7749",
    "longitude": "-122.4194",
    "time_zone": "America/Los_Angeles",
    "continent_code": "NA"
  }
}
```

### Alternative: IP Geolocation Databases

If you're not using Cloudflare Workers or need more detailed location data, you can implement a custom `GeoAdapter` using IP geolocation databases like MaxMind GeoIP2:

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

  async getGeoInfo(): Promise<GeoInfo | null> {
    const ip = this.getClientIP();
    const lookup = this.reader.get(ip);

    if (!lookup) return null;

    return {
      country_code: lookup.country?.iso_code || "",
      country_code3: lookup.country?.iso_code3 || "",
      country_name: lookup.country?.names?.en || "",
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
