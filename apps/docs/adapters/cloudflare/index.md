---
title: Cloudflare Adapter
description: Cloudflare-specific integrations for AuthHero including custom domains, caching, Analytics Engine logs, and R2 SQL for long-term storage.
---

# Cloudflare Adapter

The Cloudflare adapter provides Cloudflare-specific integrations for AuthHero, including custom domain management, caching, and optional logging solutions.

## Features

- **[Custom Domains](./custom-domains)**: Manage custom domains via Cloudflare API with automatic SSL certificates
- **[Cache](./cache)**: Cloudflare Cache API integration for high-performance caching
- **Logs** (optional): Two options for authentication logs:
  - **[Analytics Engine](./analytics-engine)**: Low-latency writes with SQL querying (90-day retention)
  - **[R2 SQL](./r2-sql)**: Long-term storage with unlimited retention
- **Edge Compatible**: Works in Cloudflare Workers and standard Node.js environments
- **Global Distribution**: Leverage Cloudflare's global network

## Installation

```bash
npm install @authhero/cloudflare-adapter
```

## Quick Start

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

  // Analytics Engine logs configuration (optional, recommended for Workers)
  analyticsEngineLogs: {
    analyticsEngineBinding: env.AUTH_LOGS,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.ANALYTICS_ENGINE_API_TOKEN,
  },

  // OR R2 SQL logs configuration (optional, for long-term storage)
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

## Adapters

### [Custom Domains](./custom-domains)

Manage custom domains through the Cloudflare API with automatic SSL certificate provisioning and DNS configuration.

**Key Features:**

- Automatic SSL certificate management
- DNS configuration through Cloudflare API
- Enterprise and non-enterprise mode support
- Full CRUD operations for domains

[Learn more about Custom Domains →](./custom-domains)

### [Cache](./cache)

High-performance caching using Cloudflare's Cache API for fast data retrieval at the edge.

**Key Features:**

- Edge-based caching for minimal latency
- Configurable TTL per cache entry
- Key prefix support for namespacing
- Simple get/set/delete operations

[Learn more about Cache →](./cache)

### Logs (Optional)

Choose between two logging solutions based on your needs:

#### [Analytics Engine](./analytics-engine)

Best for real-time analytics and recent logs with near-zero write latency.

**Key Features:**

- Fire-and-forget writes (~0ms latency)
- SQL-based querying
- 90-day retention (configurable)
- Free tier available
- Ideal for Workers

[Learn more about Analytics Engine →](./analytics-engine)

#### [R2 SQL](./r2-sql)

Best for long-term storage and compliance requirements with unlimited retention.

**Key Features:**

- Unlimited retention period
- Apache Iceberg format
- Pipeline-based ingestion
- SQL querying via R2 SQL
- Pay-as-you-go pricing

[Learn more about R2 SQL →](./r2-sql)

## Complete Integration Example

Here's a complete example integrating all adapters:

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

  // Logs (choose one: Analytics Engine or R2 SQL)
  analyticsEngineLogs: {
    analyticsEngineBinding: env.AUTH_LOGS,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    apiToken: process.env.ANALYTICS_ENGINE_API_TOKEN!,
  },
});

// Use in your application
export const dataAdapters = {
  ...database,
  cache: cloudflareAdapters.cache,
  customDomains: cloudflareAdapters.customDomains,
  logs: cloudflareAdapters.logs,
};
```

## Environment Variables

```env
# Custom Domains (required)
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_AUTH_KEY=your_api_key
CLOUDFLARE_AUTH_EMAIL=your_email
CLOUDFLARE_ENTERPRISE=false

# Cache (optional)
CACHE_NAME=default
CACHE_DEFAULT_TTL=3600
CACHE_KEY_PREFIX=authhero:

# Analytics Engine Logs (optional)
CLOUDFLARE_ACCOUNT_ID=your_account_id
ANALYTICS_ENGINE_API_TOKEN=your_analytics_token
ANALYTICS_ENGINE_DATASET=authhero_logs

# R2 SQL Logs (optional, alternative to Analytics Engine)
PIPELINE_ENDPOINT=https://your-stream-id.ingest.cloudflare.com
R2_SQL_AUTH_TOKEN=your_r2_sql_token
R2_WAREHOUSE_NAME=your_warehouse_name
R2_SQL_NAMESPACE=default
R2_SQL_TABLE=logs
```

## TypeScript Support

The package includes full TypeScript definitions:

```typescript
import type {
  CloudflareConfig,
  CloudflareAdapters,
  R2SQLLogsAdapterConfig,
  AnalyticsEngineLogsAdapterConfig,
  AnalyticsEngineDataset,
} from "@authhero/cloudflare-adapter";
```

## Best Practices

### 1. Error Handling

Always implement proper error handling:

```typescript
try {
  await customDomains.create(tenantId, domainData);
} catch (error) {
  // Log error for debugging
  console.error("Failed to create domain:", error);

  // Optionally log to your logs adapter
  if (logs) {
    await logs.create(tenantId, {
      type: "api_error",
      date: new Date().toISOString(),
      ip: request.ip,
      user_agent: request.headers["user-agent"],
      isMobile: false,
      description: `Failed to create domain: ${error.message}`,
    });
  }

  throw error;
}
```

### 2. Cache Strategy

Implement cache-aside pattern for optimal performance:

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
```

### 3. Logging Strategy

Choose the right logging solution for your use case:

- **Analytics Engine**: Real-time dashboards, recent activity monitoring
- **R2 SQL**: Compliance, audit trails, long-term analytics
- **Both**: Use passthrough adapter to write to both simultaneously

## Related Documentation

- [Cloudflare API](https://developers.cloudflare.com/api/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Custom Domain Setup Guide](/guides/custom-domain-setup)
- [AuthHero Adapter Interfaces](/adapters/interfaces/)

## Next Steps

- [Set up Custom Domains →](./custom-domains)
- [Configure Caching →](./cache)
- [Choose a Logging Solution →](./analytics-engine) or [→](./r2-sql)
