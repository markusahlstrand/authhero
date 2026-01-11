# Cloudflare Workers

Deploy AuthHero to Cloudflare's global edge network for low-latency authentication worldwide.

## Overview

Cloudflare Workers is a serverless platform that runs JavaScript at the edge in 200+ cities globally. Key benefits:

- **Global edge execution** - Sub-10ms latency worldwide
- **Automatic scaling** - Handle millions of requests
- **Pay-per-use pricing** - Free tier includes 100,000 requests/day
- **Zero cold starts** - Instant execution (when warm)

## Key Differences from Other Platforms

**Static Assets:** Cloudflare Workers cannot serve files directly from `node_modules`. You must:
1. Copy assets to a `dist/assets` directory during build
2. Configure Wrangler to serve them via `[assets]`

This is the most common setup issue - see [Widget Assets](./widget-assets) for details.

## Prerequisites

- Cloudflare account
- Wrangler CLI: `npm install -g wrangler`
- Node.js 18+ (for build tools)

## Setup

### 1. Create Copy Assets Script

Create `copy-assets.js` in your project root:

```javascript
#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy authhero assets
const authHeroAssets = path.join(__dirname, "node_modules/authhero/dist/assets");
const targetDir = path.join(__dirname, "dist/assets");

if (fs.existsSync(authHeroAssets)) {
  console.log("📦 Copying AuthHero assets...");
  copyDirectory(authHeroAssets, targetDir);
}

// Copy widget from @authhero/widget package
const widgetSource = path.join(
  __dirname,
  "node_modules/@authhero/widget/dist/authhero-widget"
);
const widgetTarget = path.join(targetDir, "u/widget");

if (fs.existsSync(widgetSource)) {
  console.log("📦 Copying widget assets...");
  copyDirectory(widgetSource, widgetTarget);
}

console.log("✅ Assets copied successfully");
```

Make it executable:

```bash
chmod +x copy-assets.js
```

### 2. Configure wrangler.toml

```toml
name = "authhero-server"
main = "src/index.ts"
compatibility_date = "2024-11-20"

# Serve static assets from dist/assets
[assets]
directory = "./dist/assets"

# D1 Database
[[d1_databases]]
binding = "AUTH_DB"
database_name = "authhero-db"
database_id = "your-database-id"  # Replace with your D1 database ID
migrations_dir = "node_modules/@authhero/drizzle/drizzle"

# Optional: Custom domain
# [route]
# pattern = "auth.example.com"
# zone_name = "example.com"
```

### 3. Update package.json

```json
{
  "scripts": {
    "copy-assets": "node copy-assets.js",
    "build": "npm run copy-assets",
    "deploy": "npm run build && wrangler deploy",
    "dev": "npm run copy-assets && wrangler dev"
  }
}
```

### 4. Application Code

Create `src/index.ts`:

```typescript
import { initMultiTenant } from "@authhero/multi-tenancy";
import { createCloudflareD1Adapter } from "@authhero/cloudflare";

interface Env {
  AUTH_DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const dataAdapter = createCloudflareD1Adapter(env.AUTH_DB);
    
    const { app } = initMultiTenant({
      dataAdapter,
      // No widgetHandler needed - Wrangler serves from [assets] config
    });

    return app.fetch(request, env, ctx);
  },
};
```

## Database Setup

### Create D1 Database

```bash
# Create database
wrangler d1 create authhero-db

# This returns:
# database_id = "abc123..."

# Update wrangler.toml with the database_id
```

### Run Migrations

```bash
# Local development database
wrangler d1 migrations apply authhero-db --local

# Production database
wrangler d1 migrations apply authhero-db --remote
```

## Development

### Local Development

```bash
# Copy assets and start dev server
npm run dev
```

Access at: http://localhost:8787

### Test Widget Loading

Visit: http://localhost:8787/u2/login/identifier?state=test

If the widget doesn't load, check:
1. `copy-assets.js` ran successfully
2. `dist/assets/u/widget/` contains files
3. Browser console for 404 errors

## Deployment

### Deploy to Production

```bash
npm run deploy
```

### Custom Domain

1. **Add domain in Cloudflare Dashboard**
   - Workers & Pages → Your worker → Settings → Domains & Routes
   - Add custom domain: `auth.example.com`

2. **Or configure in wrangler.toml**
   ```toml
   [route]
   pattern = "auth.example.com"
   zone_name = "example.com"
   ```

### Environment Variables

Set secrets via CLI:

```bash
wrangler secret put ENCRYPTION_KEY
wrangler secret put EMAIL_API_KEY
```

Or in wrangler.toml:

```toml
[vars]
LOG_LEVEL = "info"
ALLOWED_ORIGINS = "https://app.example.com"
```

## Monitoring

### View Logs

```bash
wrangler tail
```

### Analytics

Access in Cloudflare Dashboard:
- Workers & Pages → Your worker → Analytics
- Shows requests, errors, CPU time, bandwidth

## Performance Optimization

### Caching

```typescript
// Enable caching in data adapter
const dataAdapter = createCloudflareD1Adapter(env.AUTH_DB, {
  cache: {
    tenants: 3600,      // Cache tenants for 1 hour
    clients: 1800,      // Cache clients for 30 minutes
    connections: 3600,  // Cache connections for 1 hour
  },
});
```

### Reduce Cold Starts

- Use Durable Objects for session storage (coming soon)
- Keep worker size small (< 1MB)
- Minimize dependencies

### Global Performance

- Workers run in 200+ cities automatically
- D1 replication coming soon
- Use Read Replicas when available

## Limitations

Be aware of Cloudflare Workers limits:

- **CPU Time**: 50ms per request (Workers Paid: 50ms wall time)
- **Memory**: 128MB
- **Request Size**: 100MB
- **Response Size**: Unlimited (streaming)

Most AuthHero operations complete in < 10ms.

## Troubleshooting

### Widget 404 Errors

**Problem:** `/u/widget/authhero-widget.esm.js` returns 404

**Solution:**
1. Ensure `copy-assets.js` ran: `npm run copy-assets`
2. Check `dist/assets/u/widget/` contains files
3. Verify `[assets]` in wrangler.toml
4. Redeploy: `npm run deploy`

### Database Binding Error

**Problem:** `AUTH_DB is not defined`

**Solution:**
1. Check `[[d1_databases]]` in wrangler.toml
2. Ensure `binding = "AUTH_DB"` matches code
3. Run migrations: `wrangler d1 migrations apply authhero-db --remote`

### CORS Errors

**Problem:** Browser blocks requests

**Solution:**
```typescript
const { app } = initMultiTenant({
  dataAdapter,
  allowedOrigins: [
    "https://app.example.com",
    "http://localhost:3000", // Development
  ],
});
```

## Cost Estimation

Cloudflare Workers Pricing:

- **Free Tier**: 100,000 requests/day
- **Paid Plan**: $5/month + $0.50 per million requests
- **D1 Database**: Free up to 5GB storage, 25 million rows read

**Example:**
- 1 million requests/month: ~$5/month
- 10 million requests/month: ~$10/month

Very cost-effective for authentication workloads!

## Next Steps

- [Configure widget assets](./widget-assets)
- [Set up custom domains](../../guides/custom-domains)
- [Multi-cloud deployment](./multi-cloud)
- [Cloudflare adapter docs](../../adapters/cloudflare/)
