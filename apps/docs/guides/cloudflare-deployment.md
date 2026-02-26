---
title: Cloudflare Workers Deployment
description: Deploy AuthHero to Cloudflare Workers with D1 database. Quick start with create-authhero CLI, manual setup, migrations, and production deployment.
---

# Deploying AuthHero to Cloudflare Workers

This guide covers deploying AuthHero to Cloudflare Workers with D1 database.

## Quick Start

Use the `create-authhero` CLI to set up a new Cloudflare project:

```bash
npx create-authhero my-auth-app \
  --template cloudflare \
  --email admin@example.com \
  --password yourpassword123
```

## Manual Setup

### 1. Create a Project

```bash
npx create-authhero my-auth-app --template cloudflare --skip-install
cd my-auth-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create D1 Database

For production, create a remote D1 database:

```bash
wrangler d1 create authhero-db
```

Update `wrangler.toml` with your database ID from the output:

```toml
[[d1_databases]]
binding = "AUTH_DB"
database_name = "authhero-db"
database_id = "your-database-id-here"  # Replace with actual ID
migrations_dir = "migrations"
```

### 4. Run Migrations

**For local development:**

```bash
npm run migrate
# or
wrangler d1 migrations apply AUTH_DB --local
```

**For production:**

```bash
wrangler d1 migrations apply AUTH_DB --remote
```

### 5. Seed the Database

**For local development:**

```bash
npm run seed:local
```

**For production:**

```bash
npm run seed:remote
```

### 6. Test Locally

```bash
npm run dev
```

Your auth server will be available at `http://localhost:8787`

### 7. Deploy to Production

```bash
npm run deploy
```

## Project Structure

The cloudflare template includes:

```
my-auth-app/
├── migrations/
│   └── 0000_init.sql          # Database schema
├── src/
│   ├── index.ts               # Worker entry point
│   ├── app.ts                 # AuthHero configuration
│   ├── seed.ts                # Database seeding worker
│   └── types.ts               # TypeScript types
├── seed-helper.js             # Helper for seeding
├── wrangler.toml              # Cloudflare configuration
└── package.json
```

## Database Migrations

### Using D1's Native Migrations (Recommended)

The template includes a pre-generated `migrations/0000_init.sql` file that creates all necessary tables. This approach:

- ✅ Works with `wrangler d1 migrations apply`
- ✅ Supports both local and remote databases
- ✅ Integrates with Cloudflare's migration system

### Regenerating Migrations

If you need to regenerate the SQL migrations (e.g., after AuthHero updates):

```bash
# In your node_modules/@authhero/kysely-adapter directory
cd node_modules/@authhero/kysely-adapter
pnpm run export-sql:squash --output /path/to/your/project/migrations

# Or for individual migration files
pnpm run export-sql:d1
```

## Environment Variables

For production deployments, you can set secrets:

```bash
# Set secrets
wrangler secret put AUTH_SECRET
wrangler secret put SMTP_PASSWORD

# Or use .dev.vars for local development
echo "AUTH_SECRET=your-secret" >> .dev.vars
```

## Custom Domains

To add a custom domain, update `wrangler.toml`:

```toml
routes = [
  { pattern = "auth.yourdomain.com", custom_domain = true }
]
```

Then configure your domain in the Cloudflare dashboard.

## Monitoring

View logs in the Cloudflare dashboard or using wrangler:

```bash
wrangler tail
```

## Troubleshooting

### Migration Issues

If migrations fail, check:

1. Database ID is correct in `wrangler.toml`
2. Migrations directory exists and contains SQL files
3. You have the correct permissions

### Seed Worker Issues

If seeding fails:

1. Ensure migrations ran successfully first
2. Check the seed worker is accessible at the correct URL
3. Verify environment variables are set correctly

## Multi-Tenant Setup

For multi-tenant deployments with per-tenant databases, use the `--multi-tenant` flag:

```bash
npx create-authhero my-auth-app --template cloudflare --multi-tenant
```

See the [Multi-Tenancy Guide](../packages/multi-tenancy/index.md) for more details.
