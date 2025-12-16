# R2 SQL Logs Adapter

Write authentication logs to Cloudflare R2 using Pipelines for data ingestion and R2 SQL for querying.

## Architecture

This adapter uses two Cloudflare services:

- **Pipelines**: HTTP endpoint for ingesting log data into R2 Data Catalog
- **R2 SQL**: Query interface for analyzing logs stored in Apache Iceberg format

Data flow:

1. Log data is sent to Pipeline HTTP endpoint → 2. Pipeline writes to R2 in Iceberg format → 3. R2 SQL queries the Iceberg table

## Prerequisites

### 1. Create R2 Bucket and Enable Data Catalog

```bash
# Create an R2 bucket
npx wrangler r2 bucket create my-authhero-logs

# Enable R2 Data Catalog
npx wrangler r2 bucket catalog enable my-authhero-logs
```

**Important**: Note the "Warehouse" name from the output - you'll need it later.

### 2. Create API Token

In the Cloudflare Dashboard:

- Go to R2 object storage
- Select "Manage API tokens"
- Create a token with Admin Read & Write permissions
- Save the token value

### 3. Create Schema File

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

### 4. Create a Pipeline

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

## Configuration

The R2 SQL logs adapter supports three operational modes:

### 1. HTTP Endpoint Mode (Default)

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

### 2. Pipeline Binding Mode (Cloudflare Workers)

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

### 3. Passthrough Mode (Multiple Destinations)

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

// logs.create() writes to both adapters (primary first, then R2 SQL Pipeline)
// logs.get() and logs.list() read from primary only
```

**Passthrough Mode Behavior:**

- `create()`: Calls the primary adapter first, then syncs to secondaries in the background (non-blocking)
- `get()`: Reads from the primary adapter only
- `list()`: Reads from the primary adapter only
- Secondary errors are logged but don't fail the operation

## Methods

- `create(tenantId, log)` - Create a log entry (sends to Pipeline endpoint)
- `get(tenantId, logId)` - Get a specific log entry (queries R2 SQL)
- `list(tenantId, params)` - List logs with pagination and filtering (queries R2 SQL)

## Usage Example

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

## Querying Logs with R2 SQL

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

## Analytics Example

```typescript
// Track login patterns
async function analyzeLoginPatterns(logsAdapter: LogsDataAdapter, tenantId: string) {
  const result = await logsAdapter.list(tenantId, {
    per_page: 1000,
    q: "type:s", // Successful logins only
  });

  const loginsByHour = {};
  result.logs.forEach((log) => {
    const hour = new Date(log.date).getHours();
    loginsByHour[hour] = (loginsByHour[hour] || 0) + 1;
  });

  return loginsByHour;
}
```

## Environment Variables

```env
# R2 SQL Logs (optional)
PIPELINE_ENDPOINT=https://your-stream-id.ingest.cloudflare.com
R2_SQL_AUTH_TOKEN=your_r2_sql_token
R2_WAREHOUSE_NAME=your_warehouse_name
R2_SQL_NAMESPACE=default
R2_SQL_TABLE=logs
```

## Troubleshooting

### Connection Test

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

### Pipeline Issues

If logs aren't appearing:

1. Check that the Pipeline is running: `npx wrangler pipelines list`
2. Verify the HTTP endpoint URL is correct
3. Check Pipeline logs for errors
4. Ensure the schema matches your log data structure

## Related Documentation

- [Cloudflare R2 SQL](https://developers.cloudflare.com/r2-sql/)
- [R2 Data Catalog](https://developers.cloudflare.com/r2/data-catalog/)
- [Cloudflare Pipelines](https://developers.cloudflare.com/pipelines/)
- [AuthHero Cloudflare Adapter Overview](/adapters/cloudflare/)
- [Analytics Engine Logs (Alternative)](/adapters/cloudflare/analytics-engine)
