# Cloudflare Workers

Deploy AuthHero to Cloudflare's global edge network for low-latency authentication worldwide.

## Overview

Cloudflare Workers is a serverless platform that runs JavaScript at the edge in 200+ cities globally. Key benefits:

- **Global edge execution** - Sub-10ms latency worldwide
- **Automatic scaling** - Handle millions of requests
- **Pay-per-use pricing** - Free tier includes 100,000 requests/day
- **Zero cold starts** - Instant execution (when warm)

## Two deployment shapes

- **Single Worker (this page)** — one Worker serves all tenants. Tenant resolution happens inside the Worker via the `Host` header → `custom_domains` lookup. Best for most deployments.
- **Workers for Platforms** — a thin dispatcher Worker fronts a dispatch namespace; each tenant gets their own deployed `authhero` Worker for strong isolation. See [Workers for Platforms](./cloudflare-wfp). Pick this if you need per-tenant code customization, per-tenant CPU/memory limits, or true tenant isolation.

## Quickstart with `create-authhero` (recommended)

The fastest way to get a production-ready Worker is to scaffold from the official template:

```bash
npm create authhero@latest my-auth -- \
  --template=cloudflare \
  --multi-tenant \
  --admin-ui
cd my-auth
npm install
npm run setup     # creates wrangler.local.toml + .dev.vars with a generated ENCRYPTION_KEY
npm run migrate   # applies D1 migrations locally
npm run seed      # creates an admin user
npm run dev       # https://localhost:3000
```

The scaffold sets up D1 (via Drizzle), Workers Assets for the widget and admin UI, an at-rest encryption key, and `wrangler` config. To deploy:

```bash
wrangler d1 create authhero-db                    # one-time
# paste the database_id into wrangler.local.toml
npm run db:migrate:remote                          # apply migrations remotely
npm run deploy
```

The rest of this page covers the **manual setup** if you want to assemble the pieces yourself or integrate authhero into an existing Worker.

## Key Differences from Other Platforms

**Static Assets:** Cloudflare Workers cannot serve files directly from `node_modules`. You must:
1. Copy assets to a `dist/assets` directory during build
2. Configure Wrangler to serve them via `[assets]`

This is the most common setup issue - see [Widget Assets](./widget-assets) for details.

## Prerequisites

- Cloudflare account
- Wrangler CLI: `npm install -g wrangler`
- Node.js 18+ (for build tools)

## Manual setup

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
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

# Serve static assets from dist/assets
[assets]
directory = "./dist/assets"

# D1 Database
[[d1_databases]]
binding = "AUTH_DB"
database_name = "authhero-db"
database_id = "your-database-id"  # Replace with your D1 database ID
migrations_dir = "node_modules/@authhero/drizzle/drizzle"

# Dynamic Workers — required for user-authored code hooks (Actions)
[[worker_loaders]]
binding = "LOADER"

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
import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import {
  createEncryptedDataAdapter,
  loadEncryptionKey,
} from "authhero";
import { initMultiTenant } from "@authhero/multi-tenancy";
import { WorkerLoaderCodeExecutor } from "@authhero/cloudflare-adapter";

interface Env {
  AUTH_DB: D1Database;
  ENCRYPTION_KEY?: string;
  LOADER?: any; // Worker Loader binding — only needed for code hooks (Actions)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const issuer = `${url.protocol}//${url.host}/`;

    const db = drizzle(env.AUTH_DB, { schema });
    let dataAdapter = createAdapters(db, { useTransactions: false });

    // Encrypt sensitive credential fields at rest when ENCRYPTION_KEY is set.
    if (env.ENCRYPTION_KEY) {
      const encryptionKey = await loadEncryptionKey(env.ENCRYPTION_KEY);
      dataAdapter = createEncryptedDataAdapter(dataAdapter, encryptionKey);
    }

    const { app } = initMultiTenant({
      dataAdapter,
      // Optional: enable user-authored code hooks (Actions) via Dynamic Workers
      ...(env.LOADER && {
        codeExecutor: new WorkerLoaderCodeExecutor({ loader: env.LOADER }),
      }),
    });

    return app.fetch(request, { ...env, ISSUER: issuer });
  },
};
```

This is the same shape the `create-authhero --template=cloudflare` template generates. See [packages/create-authhero/templates/cloudflare/src/index.ts](https://github.com/markusahlstrand/authhero/blob/main/packages/create-authhero/templates/cloudflare/src/index.ts) for the canonical version.

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

Access at: `http://localhost:8787`

### Test Widget Loading

Visit: `http://localhost:8787/u2/login/identifier?state=test`

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

The Cloudflare adapter ships a Cache API integration. Wire it up via `createCloudflareAdapters` and pass the `cache` adapter alongside your `dataAdapter`:

```typescript
import createCloudflareAdapters from "@authhero/cloudflare-adapter";

const { cache } = createCloudflareAdapters({
  cacheName: "default",
  defaultTtlSeconds: 3600,
  keyPrefix: "authhero:",
  // ... other Cloudflare adapter options
});

const { app } = initMultiTenant({
  dataAdapter,
  cache,
});
```

See [Cloudflare Adapter → Cache](/customization/cloudflare-adapter/cache) for details.

### Reduce Cold Starts

- Keep worker size small (< 1MB)
- Minimize dependencies

### Global Performance

- Workers run in 200+ cities automatically
- [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/) is available in public beta — opt in per database and Cloudflare serves reads from regional replicas. Queries must go through the D1 Sessions API (`withSession()`) to benefit; AuthHero's adapters don't use it yet, so today this only helps custom read paths you wire up yourself

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

- [Workers for Platforms (per-tenant workers)](./cloudflare-wfp)
- [Configure widget assets](./widget-assets)
- [Set up custom domains](/deployment/custom-domain-setup)
- [Multi-cloud deployment](./multi-cloud)
- [Cloudflare adapter docs](/customization/cloudflare-adapter/)
