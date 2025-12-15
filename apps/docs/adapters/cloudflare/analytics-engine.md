# Analytics Engine Logs Adapter

Write authentication logs to Cloudflare Workers Analytics Engine for low-latency writes and SQL-based querying.

## Architecture

This adapter uses Cloudflare's Workers Analytics Engine:

- **Write**: Fire-and-forget writes using `writeDataPoint()` (no HTTP latency)
- **Query**: SQL API for analyzing logs stored in Analytics Engine

## When to Use Analytics Engine vs R2 SQL

| Feature        | Analytics Engine                 | R2 SQL + Pipelines            |
| -------------- | -------------------------------- | ----------------------------- |
| Write Latency  | ~0ms (fire-and-forget)           | ~50-100ms (HTTP)              |
| Data Retention | 90 days (free), configurable     | Unlimited                     |
| Query Language | SQL (ClickHouse-like)            | SQL (Iceberg)                 |
| Best For       | Real-time analytics, recent logs | Long-term storage, compliance |
| Pricing        | Free tier available              | Pay per storage + queries     |

## Prerequisites

### 1. Create an Analytics Engine Dataset

Configure in `wrangler.toml`:

```toml
[[analytics_engine_datasets]]
binding = "AUTH_LOGS"
dataset = "authhero_logs"
```

Then deploy your Worker to create the dataset:

```bash
npx wrangler deploy
```

**Note:** The Analytics Engine dataset is automatically created when you first deploy a Worker with the binding configured. The binding provides write access via `writeDataPoint()`.

### 2. Create an API Token (For Queries)

To query logs via the SQL API, you need to create a Cloudflare API token:

1. Go to [Cloudflare Dashboard API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Select "Create Custom Token"
4. Configure:
   - **Token name**: `Analytics Engine Read`
   - **Permissions**: 
     - Account → Analytics → Read
5. Click "Continue to summary" then "Create Token"
6. **Save the token value** - you won't be able to see it again

### 3. Get Your Account ID

Find your Cloudflare Account ID:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select any domain or go to Workers & Pages
3. Your Account ID is displayed in the right sidebar

## Configuration

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

## Methods

- `create(tenantId, log)` - Create a log entry (writes to Analytics Engine)
- `get(tenantId, logId)` - Get a specific log entry (queries SQL API)
- `list(tenantId, params)` - List logs with pagination and filtering (queries SQL API)

## Usage Example

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
      zoneId: "your-zone-id",
      authKey: "your-api-key",
      authEmail: "your-email",
      customDomainAdapter: yourDbAdapter,

      analyticsEngineLogs: {
        analyticsEngineBinding: env.AUTH_LOGS,
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
      },
    });

    const { logs } = adapters;

    // Write a log (fire-and-forget, no await needed but recommended)
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

## Querying Logs with SQL API

You can query Analytics Engine directly using the SQL API. The adapter's `get()` and `list()` methods use this API internally, but you can also query it directly.

### Using cURL

```bash
# Replace with your account ID and API token
export ACCOUNT_ID="your_account_id"
export API_TOKEN="your_api_token"

# List recent logs for a tenant
curl "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: text/plain" \
  -d "SELECT * FROM authhero_logs WHERE index1 = 'tenant-123' ORDER BY timestamp DESC LIMIT 50"

# Count logins by type
curl "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: text/plain" \
  -d "SELECT blob3 as type, count() as count FROM authhero_logs WHERE index1 = 'tenant-123' GROUP BY blob3"

# Get logs for specific user
curl "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: text/plain" \
  -d "SELECT * FROM authhero_logs WHERE index1 = 'tenant-123' AND blob8 = 'user-456' ORDER BY timestamp DESC"

# Example with all fields
curl "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: text/plain" \
  -d "SELECT * FROM auth_logs LIMIT 10;"
```

### Query Tips

**Important Notes:**
- Use `index1` for filtering by `tenant_id` - it's indexed for efficient queries
- The dataset name in queries is what you defined in `wrangler.toml` (e.g., `authhero_logs` or `auth_logs`)
- Results are returned as JSON
- Query language is ClickHouse-like SQL dialect

**Common Query Patterns:**

```sql
-- Filter by time range
SELECT * FROM authhero_logs 
WHERE index1 = 'tenant-123' 
  AND timestamp >= NOW() - INTERVAL 1 DAY
ORDER BY timestamp DESC;

-- Aggregate by hour
SELECT 
  toStartOfHour(timestamp) as hour,
  count() as login_count
FROM authhero_logs
WHERE index1 = 'tenant-123'
  AND blob3 = 's'
GROUP BY hour
ORDER BY hour DESC;

-- Failed login attempts by user
SELECT 
  blob8 as user_id,
  blob9 as user_name,
  count() as failed_attempts
FROM authhero_logs
WHERE index1 = 'tenant-123'
  AND blob3 = 'f'
  AND timestamp >= NOW() - INTERVAL 7 DAY
GROUP BY blob8, blob9
ORDER BY failed_attempts DESC;
```

## Data Schema

Analytics Engine stores logs using blob and double fields:

| Field   | Type   | Description                         |
| ------- | ------ | ----------------------------------- |
| blob1   | string | log_id                              |
| blob2   | string | tenant_id                           |
| blob3   | string | type (e.g., "s", "f")               |
| blob4   | string | date (ISO string)                   |
| blob5   | string | description                         |
| blob6   | string | ip                                  |
| blob7   | string | user_agent                          |
| blob8   | string | user_id                             |
| blob9   | string | user_name                           |
| blob10  | string | connection                          |
| blob11  | string | connection_id                       |
| blob12  | string | client_id                           |
| blob13  | string | client_name                         |
| blob14  | string | audience                            |
| blob15  | string | scope                               |
| blob16  | string | strategy                            |
| blob17  | string | strategy_type                       |
| blob18  | string | hostname                            |
| blob19  | string | details (JSON stringified)          |
| blob20  | string | auth0_client (JSON stringified)     |
| double1 | number | isMobile (0 or 1)                   |
| double2 | number | timestamp (epoch ms)                |
| index1  | string | tenant_id (for efficient filtering) |

## Passthrough Mode

Use the core `createPassthroughAdapter` utility to sync logs to multiple destinations:

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
# Analytics Engine Logs (optional)
CLOUDFLARE_ACCOUNT_ID=your_account_id
ANALYTICS_ENGINE_API_TOKEN=your_analytics_token
ANALYTICS_ENGINE_DATASET=authhero_logs
```

## Error Handling

```typescript
try {
  await logs.create(tenantId, logData);
} catch (error) {
  console.error("Failed to write log:", error);
  // Analytics Engine writes are fire-and-forget, so errors are rare
  // Consider implementing a fallback mechanism
}
```

## Related Documentation

- [Cloudflare Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)
- [Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)
- [AuthHero Cloudflare Adapter Overview](/adapters/cloudflare/)
- [R2 SQL Logs (Alternative)](/adapters/cloudflare/r2-sql)
