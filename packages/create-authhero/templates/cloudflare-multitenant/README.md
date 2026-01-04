# AuthHero Multi-Tenant Server

A production-grade multi-tenant AuthHero authentication server using Cloudflare Workers with:

- Multi-tenant support with tenant isolation at the data level
- Multiple tenants in a single D1 database
- Static assets (widget, CSS, JS) served via Cloudflare Workers Assets
- Easy setup similar to single-tenant

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │         Cloudflare Worker               │
                    │                                         │
                    │  ┌─────────────────────────────────┐   │
                    │  │      AuthHero Multi-Tenant      │   │
                    │  │   - Multiple tenants per DB     │   │
                    │  │   - Tenant isolation via API    │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │  ┌───────────┴────────────────────┐     │
                    │  │      Static Assets             │     │
                    │  │  /u/widget/* /u/css/* /u/js/*  │     │
                    │  └────────────────────────────────┘     │
                    │              │                          │
                    └──────────────┼──────────────────────────┘
                                   │
                                   ▼
                          ┌─────────────┐
                          │     D1      │
                          │  Database   │
                          │ (All Tenants)│
                          └─────────────┘
```

## Static Assets

The authentication widget, CSS, and client-side JavaScript are served as static assets via Cloudflare Workers Assets.

### How It Works

1. **Source**: Assets are bundled with the `authhero` package in `node_modules/authhero/dist/assets`
2. **Build Step**: The `copy-assets.js` script copies these files to `./dist/assets` before dev/deploy
3. **Serving**: Wrangler serves files from `./dist/assets` (configured in `wrangler.toml`)
4. **Automatic**: The copy happens automatically when you run `npm run dev` or `npm run deploy`

> **Note**: Wrangler's Assets feature does not support serving files directly from `node_modules`, which is why the copy step is necessary.

Assets are served at:

- `/u/widget/*` - AuthHero login widget (Stencil web component)
- `/u/css/*` - Tailwind CSS for universal login pages
- `/u/js/*` - Client-side JavaScript bundle

## Security & Privacy

This project is designed to be **open-source friendly**. Sensitive Cloudflare IDs are kept out of version control:

| File                  | Purpose                            | In Git? |
| --------------------- | ---------------------------------- | ------- |
| `wrangler.toml`       | Base config (safe for public repo) | ✅ Yes  |
| `wrangler.local.toml` | Your private IDs (database_id)     | ❌ No   |
| `.dev.vars`           | Local secrets (API tokens, etc.)   | ❌ No   |
| `.dev.vars.example`   | Template for .dev.vars             | ✅ Yes  |

**For GitHub Actions / CI:**

- Set `CLOUDFLARE_API_TOKEN` as a GitHub Secret
- Set `CLOUDFLARE_ACCOUNT_ID` as a GitHub Secret (if needed)
- The wrangler action will use these automatically

## Getting Started

### Local Development (Quick Start)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run database migrations (uses local SQLite-backed D1):

   ```bash
   npm run migrate
   ```

3. Seed the database with an admin user:

   ```bash
   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The server will be available at `https://localhost:3000`.

### Remote Development (Your Cloudflare Account)

1. Create a D1 database:

   ```bash
   npx wrangler d1 create authhero-db
   ```

2. Copy the `database_id` from the output and update `wrangler.local.toml`:

   ```toml
   [[d1_databases]]
   binding = "AUTH_DB"
   database_name = "authhero-db"
   database_id = "paste-your-database-id-here"
   migrations_dir = "node_modules/@authhero/drizzle/drizzle"
   ```

3. Run remote migrations:

   ```bash
   npm run db:migrate:remote
   ```

4. Seed the remote database:

   ```bash
   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed:remote
   ```

5. Start with remote D1:
   ```bash
   npm run dev:remote
   ```

## Production Deployment

1. Ensure `wrangler.local.toml` has your production `database_id`.

2. Deploy:
   ```bash
   npm run deploy
   ```

## Multi-Tenant Features

### Shared Database Model

All tenants share a single D1 database, with data isolation enforced at the application level. This is simpler to manage and suitable for most use cases.

### Creating Additional Tenants

You can create additional tenants using the Management API:

```bash
# Get an access token first
TOKEN=$(curl -s https://your-server/oauth/token \
  -d grant_type=client_credentials \
  -d client_id=default \
  -d client_secret=your-secret \
  -d audience=https://your-server/api/v2/ | jq -r '.access_token')

# Create a new tenant
curl -X POST https://your-server/api/v2/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "tenant2", "name": "Tenant 2"}'
```

## Project Structure

```
├── src/
│   ├── index.ts           # Worker entry point
│   ├── app.ts             # AuthHero app configuration
│   ├── seed.ts            # Database seeding worker
│   └── types.ts           # TypeScript type definitions
├── wrangler.toml          # Cloudflare Worker configuration
├── drizzle.config.ts      # Drizzle configuration (reference only)
├── seed-helper.js         # Helper script to run seeds
└── package.json
```

## Database Migrations

Database migrations are pre-generated and shipped with the `@authhero/drizzle` package. The schema is managed by AuthHero to ensure compatibility with future updates.

To apply migrations:

- **Local development**: `npm run migrate`
- **Production**: `npm run db:migrate:remote`

> ⚠️ **Note**: Do not run `drizzle-kit generate`. The `drizzle.config.ts` file is provided for reference only.

## API Documentation

Visit your worker URL with `/docs` to see the Swagger UI documentation.

## Tenant Management

Tenants are managed via the `/management/tenants` endpoint:

```bash
# Create a new tenant
curl -X POST https://your-worker.workers.dev/management/tenants \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"id": "tenant1", "name": "Tenant 1"}'

# List all tenants
curl https://your-worker.workers.dev/management/tenants \
  -H "Authorization: Bearer <token>"
```

For more information, visit [https://authhero.net/docs](https://authhero.net/docs).

## CI/CD with GitHub Actions

If you selected GitHub CI during setup, your project includes automated workflows for continuous integration and deployment.

### Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           GitHub Actions                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  Any Push    │     │   Push to main   │     │ GitHub Release   │    │
│  │              │     │                  │     │   (released)     │    │
│  └──────┬───────┘     └────────┬─────────┘     └────────┬─────────┘    │
│         │                      │                        │               │
│         ▼                      ▼                        ▼               │
│  ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  Unit Tests  │     │ Semantic Release │     │    Deploy to     │    │
│  │  Type Check  │     │  + Deploy Dev    │     │   Production     │    │
│  └──────────────┘     └──────────────────┘     └──────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Workflows

1. **Unit Tests** (`.github/workflows/unit-tests.yml`)
   - **Trigger**: All pushes to any branch
   - **Actions**: Runs type checking and tests

2. **Deploy to Dev** (`.github/workflows/deploy-dev.yml`)
   - **Trigger**: Push to `main` branch
   - **Actions**:
     - Runs semantic-release to create version tags
     - Deploys to Cloudflare Workers (dev environment)

3. **Deploy to Production** (`.github/workflows/release.yml`)
   - **Trigger**: GitHub Release (when "released")
   - **Actions**: Deploys to Cloudflare Workers (production environment)

### Required Secrets

Configure these secrets in your GitHub repository settings:

| Secret                      | Description                                     |
| --------------------------- | ----------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`      | Cloudflare API token for dev deployments        |
| `PROD_CLOUDFLARE_API_TOKEN` | Cloudflare API token for production deployments |

### Semantic Versioning

Commits to `main` are analyzed to determine version bumps:

- `fix:` - Patch release (1.0.0 → 1.0.1)
- `feat:` - Minor release (1.0.0 → 1.1.0)
- `BREAKING CHANGE:` - Major release (1.0.0 → 2.0.0)

### Production Deployment

To deploy to production:

1. Go to GitHub → Releases → "Draft a new release"
2. Create a new tag (e.g., `v1.0.0`)
3. Click "Publish release"
4. The `release.yml` workflow will deploy to production

### Wrangler Configuration

For production deployments, add an environment to `wrangler.toml`:

```toml
[env.production]
name = "your-worker-production"
# Add production-specific settings here
```

## Optional Features

### Analytics Engine (Centralized Logging)

Cloudflare Analytics Engine provides centralized logging for your authentication events. To enable:

#### Via Cloudflare Dashboard:

1. Go to **Workers & Pages** > **Analytics Engine**
2. Click **Create a dataset**
3. Name it `authhero_logs`
4. Copy the dataset name for your wrangler.toml

#### Via Wrangler CLI:

```bash
# There's no CLI command to create Analytics Engine datasets yet
# You must use the Cloudflare Dashboard
```

#### Configuration Steps:

1. **Create `.dev.vars` file** for local development:

   ```env
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   CLOUDFLARE_API_TOKEN=your_api_token
   # Optional: separate token for Analytics Engine
   ANALYTICS_ENGINE_API_TOKEN=your_analytics_token
   ```

2. **Update `wrangler.toml`** - uncomment the Analytics Engine section:

   ```toml
   [[analytics_engine_datasets]]
   binding = "AUTH_LOGS"
   dataset = "authhero_logs"
   ```

3. **Update `src/types.ts`** - uncomment the Analytics Engine types:

   ```typescript
   import { AnalyticsEngineDataset } from "@authhero/cloudflare-adapter";

   export interface Env {
     AUTH_DB: D1Database;
     AUTH_LOGS: AnalyticsEngineDataset;
     CLOUDFLARE_ACCOUNT_ID: string;
     CLOUDFLARE_API_TOKEN: string;
     ANALYTICS_ENGINE_API_TOKEN?: string;
   }
   ```

4. **Update `src/index.ts`** - uncomment the Cloudflare adapter code:

   ```typescript
   import createCloudflareAdapters from "@authhero/cloudflare-adapter";
   // ... in the fetch handler:
   const cloudflareAdapters = createCloudflareAdapters({
     accountId: env.CLOUDFLARE_ACCOUNT_ID,
     apiToken: env.CLOUDFLARE_API_TOKEN,
     analyticsEngineLogs: {
       analyticsEngineBinding: env.AUTH_LOGS,
       accountId: env.CLOUDFLARE_ACCOUNT_ID,
       apiToken: env.ANALYTICS_ENGINE_API_TOKEN || env.CLOUDFLARE_API_TOKEN,
       dataset: "authhero_logs",
     },
   });
   // ... spread into config:
   const config: AuthHeroConfig = {
     dataAdapter,
     ...cloudflareAdapters,
   };
   ```

5. **Install the package**:

   ```bash
   npm install @authhero/cloudflare-adapter
   ```

6. **Set secrets for production**:
   ```bash
   wrangler secret put CLOUDFLARE_ACCOUNT_ID
   wrangler secret put CLOUDFLARE_API_TOKEN
   # Optional:
   wrangler secret put ANALYTICS_ENGINE_API_TOKEN
   ```

### Rate Limiting

Cloudflare Rate Limiting helps protect your authentication endpoints from abuse. **Requires Workers Paid plan ($5/month)**.

#### Via Cloudflare Dashboard:

Rate limiting bindings are configured in `wrangler.toml`, not in the Dashboard.

#### Configuration Steps:

1. **Ensure you have a Workers Paid plan** - Rate limiting is not available on the free tier.

2. **Update `wrangler.toml`** - uncomment the Rate Limiting section:

   ```toml
   [[unsafe.bindings]]
   name = "RATE_LIMITER"
   type = "ratelimit"
   namespace_id = "1001"  # Unique namespace ID for this limiter
   simple = { limit = 100, period = 60 }  # 100 requests per 60 seconds
   ```

3. **Update `src/types.ts`** - add the RateLimiter type:

   ```typescript
   export interface Env {
     AUTH_DB: D1Database;
     RATE_LIMITER: RateLimiter;
   }
   ```

4. **Add rate limiting logic in `src/index.ts`**:

   ```typescript
   export default {
     async fetch(request: Request, env: Env): Promise<Response> {
       // Get client IP for rate limiting
       const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

       // Check rate limit
       const { success } = await env.RATE_LIMITER.limit({ key: clientIp });
       if (!success) {
         return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
           status: 429,
           headers: { "Content-Type": "application/json" },
         });
       }

       // ... rest of the handler
     },
   };
   ```

#### Rate Limit Configuration Options:

| Option         | Description                        | Example  |
| -------------- | ---------------------------------- | -------- |
| `limit`        | Max requests allowed               | `100`    |
| `period`       | Time window in seconds             | `60`     |
| `namespace_id` | Unique ID (string) for the limiter | `"1001"` |

#### Advanced Rate Limiting:

For more granular control, you can rate limit by:

- **Tenant ID**: `{ key: tenantId }`
- **User ID**: `{ key: userId }`
- **Endpoint + IP**: `{ key: \`\${pathname}:\${clientIp}\` }`

```typescript
// Rate limit login attempts more strictly
if (url.pathname.includes("/oauth/token")) {
  const { success } = await env.LOGIN_RATE_LIMITER.limit({
    key: `login:${clientIp}`,
  });
  if (!success) {
    return new Response("Too many login attempts", { status: 429 });
  }
}
```
