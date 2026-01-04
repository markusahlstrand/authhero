# AuthHero Cloudflare Simple Server

A single-tenant AuthHero authentication server using Cloudflare Workers and D1.

## Prerequisites

- [Cloudflare Account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a D1 database (if not using local mode):

   ```bash
   wrangler d1 create authhero-db
   ```

   Update `wrangler.toml` with your database ID from the output above.

3. Run database migrations:

   **For local development:**

   ```bash
   npm run migrate
   ```

   **For production:**

   ```bash
   npm run db:migrate:remote
   ```

4. Seed the database with an admin user:

   **For local development:**

   ```bash
   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed:local
   ```

   **For production:**

   ```bash
   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed:remote
   ```

5. Start the development server:

   **For local mode (local D1 database):**

   ```bash
   npm run dev:local
   ```

   **For remote mode (production D1 database):**

   ```bash
   npm run dev:remote
   ```

## Available Scripts

- `npm run dev:local` - Start development server with local D1 database
- `npm run dev:remote` - Start development server with remote D1 database
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run migrate` - Run migrations on local database
- `npm run db:migrate:local` - Run migrations on local database (alias)
- `npm run db:migrate:remote` - Run migrations on remote database
- `npm run seed:local` - Seed local database with admin user
- `npm run seed:remote` - Seed remote database with admin user

## Deployment

1. Deploy to Cloudflare:

   ```bash
   npm run deploy
   ```

2. Run production migrations:

   ```bash
   npm run db:migrate:remote
   ```

3. Seed the production database:
   ```bash
   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword npm run seed:remote
   ```

## Project Structure

```
├── src/
│   ├── index.ts          # Worker entry point
│   ├── app.ts            # AuthHero app configuration
│   ├── seed.ts           # Database seeding worker
│   └── types.ts          # TypeScript type definitions
├── drizzle.config.ts     # Drizzle configuration (reference only)
├── seed-helper.js        # Helper script for automated seeding
├── wrangler.toml         # Cloudflare Worker configuration
└── package.json
```

## Database Migrations

Database migrations are pre-generated and shipped with the `@authhero/drizzle` package. The schema is managed by AuthHero to ensure compatibility with future updates.

To apply migrations:

- **Local development**: `npm run migrate` or `npm run db:migrate:local`
- **Production**: `npm run db:migrate:remote`

> ⚠️ **Note**: Do not run `drizzle-kit generate`. The `drizzle.config.ts` file is provided for reference only.

## API Documentation

Visit your worker URL with `/docs` to see the Swagger UI documentation.

## Custom Domain

To add a custom domain, update `wrangler.toml`:

```toml
routes = [
  { pattern = "auth.yourdomain.com", custom_domain = true }
]
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

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for dev deployments |
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
   ```

### Rate Limiting

Cloudflare Rate Limiting helps protect your authentication endpoints from abuse. **Requires Workers Paid plan ($5/month)**.

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
