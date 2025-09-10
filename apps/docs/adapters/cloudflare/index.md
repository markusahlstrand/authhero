# Cloudflare Adapter

The Cloudflare adapter is optimized for Cloudflare Workers and edge computing environments. It provides seamless integration with Cloudflare's D1 database, Workers KV, and other Cloudflare services.

## Features

- **D1 Database Integration**: Native support for Cloudflare's serverless SQL database
- **Workers KV Storage**: Key-value storage for caching and session data
- **Edge Runtime Compatible**: Designed specifically for edge computing
- **Global Distribution**: Deploy authentication globally with minimal latency
- **Serverless Scalability**: Automatic scaling with no infrastructure management
- **Zero Cold Start**: Near-instantaneous startup times

## Installation

```bash
npm install @authhero/cloudflare
```

## Configuration

### Basic Setup

```typescript
import { Database } from '@authhero/cloudflare';

export interface Env {
  DB: D1Database;          // D1 binding
  KV: KVNamespace;         // KV binding
  AUTH_SECRET: string;     // Environment variable
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const database = new Database({
      d1: env.DB,
      kv: env.KV,
      secret: env.AUTH_SECRET
    });

    // Use database for authentication operations
    const user = await database.users.get(userId, tenantId);
    
    return new Response(JSON.stringify(user));
  }
};
```

### Worker Configuration

```toml
# wrangler.toml
name = "authhero-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "authhero"
database_id = "your-d1-database-id"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

[vars]
AUTH_SECRET = "your-auth-secret"
```

## D1 Database Operations

### Schema Setup

```sql
-- D1 schema (automatically applied during deployment)
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT,
  audience TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, tenant_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

### Database Operations

```typescript
// Create a user
const user = await database.users.create({
  userId: 'user_123',
  tenantId: 'tenant_456',
  email: 'user@example.com',
  emailVerified: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Query with D1's SQL interface
const result = await env.DB.prepare(`
  SELECT u.*, COUNT(s.id) as session_count
  FROM users u
  LEFT JOIN sessions s ON u.user_id = s.user_id AND u.tenant_id = s.tenant_id
  WHERE u.tenant_id = ?
  GROUP BY u.user_id
`)
.bind(tenantId)
.all();
```

## KV Storage Integration

### Session Management

```typescript
// Store session in KV for fast global access
await env.KV.put(
  `session:${sessionId}`,
  JSON.stringify({
    userId: 'user_123',
    tenantId: 'tenant_456',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }),
  {
    expirationTtl: 24 * 60 * 60 // 24 hours
  }
);

// Retrieve session
const sessionData = await env.KV.get(`session:${sessionId}`, 'json');
```

### Caching

```typescript
// Cache frequently accessed data
const cacheKey = `user:${userId}:${tenantId}`;
let user = await env.KV.get(cacheKey, 'json');

if (!user) {
  user = await database.users.get(userId, tenantId);
  
  // Cache for 5 minutes
  await env.KV.put(cacheKey, JSON.stringify(user), {
    expirationTtl: 300
  });
}
```

## Edge-Optimized Features

### Request Geolocation

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const country = request.cf?.country;
    const region = request.cf?.region;
    
    // Log geolocation info
    await database.logs.create({
      type: 'login',
      country,
      region,
      ip: request.headers.get('CF-Connecting-IP'),
      // ... other log data
    });
  }
};
```

### Rate Limiting

```typescript
async function rateLimit(ip: string, env: Env): Promise<boolean> {
  const key = `rate_limit:${ip}`;
  const count = await env.KV.get(key);
  
  if (count && parseInt(count) > 10) {
    return false; // Rate limited
  }
  
  const newCount = count ? parseInt(count) + 1 : 1;
  await env.KV.put(key, newCount.toString(), {
    expirationTtl: 60 // 1 minute window
  });
  
  return true;
}
```

## Deployment

### Database Migrations

```bash
# Create D1 database
wrangler d1 create authhero

# Apply schema
wrangler d1 execute authhero --file=./migrations/schema.sql

# Apply migrations
wrangler d1 migrations apply authhero
```

### Worker Deployment

```bash
# Deploy to Cloudflare Workers
wrangler deploy

# Deploy with environment
wrangler deploy --env production
```

### Environment Configuration

```toml
# wrangler.toml
[env.production]
name = "authhero-production"

[[env.production.d1_databases]]
binding = "DB"
database_name = "authhero-prod"
database_id = "your-prod-d1-id"

[[env.production.kv_namespaces]]
binding = "KV"
id = "your-prod-kv-id"

[env.production.vars]
AUTH_SECRET = "your-production-secret"
```

## Performance Optimization

### Connection Reuse

```typescript
// Reuse database connections across requests
let database: Database | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!database) {
      database = new Database({
        d1: env.DB,
        kv: env.KV,
        secret: env.AUTH_SECRET
      });
    }
    
    // Use cached database instance
    const user = await database.users.get(userId, tenantId);
    
    return new Response(JSON.stringify(user));
  }
};
```

### Batch Operations

```typescript
// Batch D1 operations for better performance
const batch = [
  env.DB.prepare('INSERT INTO users (user_id, tenant_id, email) VALUES (?, ?, ?)')
    .bind('user_1', 'tenant_1', 'user1@example.com'),
  env.DB.prepare('INSERT INTO users (user_id, tenant_id, email) VALUES (?, ?, ?)')
    .bind('user_2', 'tenant_1', 'user2@example.com')
];

await env.DB.batch(batch);
```

## Integration with Cloudflare Services

### Access Integration

```typescript
import { AccessJWT } from '@cloudflare/workers-types';

// Integrate with Cloudflare Access
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const accessJWT = request.headers.get('CF-Access-Jwt-Assertion');
    
    if (accessJWT) {
      // Verify Access JWT and extract user info
      const accessUser = await verifyAccessJWT(accessJWT);
      
      // Map to AuthHero user
      const user = await database.users.findByEmail(
        accessUser.email,
        tenantId
      );
    }
  }
};
```

### Images Integration

```typescript
// Resize and optimize user avatars
async function processAvatar(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const imageRequest = new Request(imageUrl, {
    cf: {
      image: {
        width: 128,
        height: 128,
        fit: 'cover',
        quality: 85
      }
    }
  });
  
  return imageRequest.url;
}
```

## Monitoring and Analytics

### Worker Analytics

```typescript
// Track custom metrics
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const start = Date.now();
    
    try {
      const response = await handleRequest(request, env);
      
      // Track successful requests
      ctx.waitUntil(
        env.KV.put(
          `metrics:${Date.now()}`,
          JSON.stringify({
            duration: Date.now() - start,
            status: 'success',
            endpoint: new URL(request.url).pathname
          }),
          { expirationTtl: 60 * 60 * 24 } // 24 hours
        )
      );
      
      return response;
    } catch (error) {
      // Track errors
      ctx.waitUntil(
        env.KV.put(
          `errors:${Date.now()}`,
          JSON.stringify({
            error: error.message,
            stack: error.stack,
            endpoint: new URL(request.url).pathname
          }),
          { expirationTtl: 60 * 60 * 24 * 7 } // 7 days
        )
      );
      
      throw error;
    }
  }
};
```

### Logging

```typescript
// Structured logging for Cloudflare
function log(level: string, message: string, data?: any) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    data
  }));
}

// Usage
log('info', 'User login', { userId, tenantId, country });
log('error', 'Database connection failed', { error: error.message });
```

## Security Considerations

### IP Allowlisting

```typescript
const ALLOWED_IPS = ['192.168.1.1', '10.0.0.1'];

function isIPAllowed(request: Request): boolean {
  const clientIP = request.headers.get('CF-Connecting-IP');
  return ALLOWED_IPS.includes(clientIP);
}
```

### CORS Configuration

```typescript
function setCORSHeaders(response: Response, origin?: string): Response {
  response.headers.set('Access-Control-Allow-Origin', origin || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}
```

## Troubleshooting

### Common Issues

1. **D1 Connection Errors**: Verify database binding configuration
2. **KV Timeouts**: Implement proper error handling and retries
3. **Cold Starts**: Use connection reuse to minimize initialization overhead
4. **Rate Limits**: Respect Cloudflare's platform limits

### Debug Mode

```typescript
const DEBUG = env.ENVIRONMENT === 'development';

if (DEBUG) {
  console.log('Database query:', query);
  console.log('KV operation:', operation);
}
```

### Performance Monitoring

```typescript
// Monitor D1 query performance
async function monitoredQuery(query: string, params: any[]) {
  const start = performance.now();
  
  try {
    const result = await env.DB.prepare(query).bind(...params).all();
    const duration = performance.now() - start;
    
    if (duration > 1000) { // Log slow queries
      console.warn('Slow query detected:', { query, duration });
    }
    
    return result;
  } catch (error) {
    console.error('Query failed:', { query, error: error.message });
    throw error;
  }
}
```

The Cloudflare adapter provides excellent performance and global distribution for AuthHero deployments, making it ideal for applications requiring low latency and high availability worldwide.
