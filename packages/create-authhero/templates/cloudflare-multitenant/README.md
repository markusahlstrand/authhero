# AuthHero Multi-Tenant Server

A production-grade multi-tenant AuthHero authentication server using Cloudflare Workers with:

- Per-tenant D1 databases (dynamically created via REST API)
- Analytics Engine for centralized logging
- Subdomain-based tenant routing (optional)

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │         Cloudflare Worker               │
                    │                                         │
                    │  ┌─────────────────────────────────┐   │
                    │  │      AuthHero Multi-Tenant      │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    │              ▼                          │
                    │  ┌─────────────────────────────────┐   │
                    │  │   Multi-Tenancy Plugin          │   │
                    │  │   - Access Control              │   │
                    │  │   - Subdomain Routing           │   │
                    │  │   - Database Resolution         │   │
                    │  └─────────────────────────────────┘   │
                    │              │                          │
                    └──────────────┼──────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
   │   Main D1   │         │  Tenant D1  │         │  Analytics  │
   │  Database   │         │  Databases  │         │   Engine    │
   │  (Bound)    │         │  (via REST) │         │   (Logs)    │
   └─────────────┘         └─────────────┘         └─────────────┘
```

## Prerequisites

- [Cloudflare Account](https://dash.cloudflare.com/sign-up) with Workers Paid plan
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare API Token with D1 and Workers permissions

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the main D1 database:

   ```bash
   wrangler d1 create authhero-main-db
   ```

3. Update `wrangler.toml` with your database ID.

4. Create `.dev.vars` from the example:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

5. Update `.dev.vars` with your Cloudflare credentials.

6. Run local database migrations:

   ```bash
   npm run db:migrate
   ```

7. Start the development server:
   ```bash
   npm run dev
   ```

## Cloudflare API Token

Create an API token with the following permissions:

- **Account** > D1 > Edit
- **Account** > Workers Analytics Engine > Edit
- **Zone** > Workers Routes > Edit (if using custom domains)

## Multi-Tenant Features

### Per-Tenant Database Isolation

Each tenant gets its own D1 database, created dynamically when the tenant is provisioned:

- Main tenant uses the bound D1 database (low latency)
- Other tenants use D1 databases via REST API

### Access Control

- Users authenticate against the main tenant
- Organization membership grants access to specific tenants
- Tokens with `org` claim can access the matching tenant

### Subdomain Routing (Optional)

Enable subdomain routing to route requests based on subdomain:

- `tenant1.auth.example.com` → tenant1
- `tenant2.auth.example.com` → tenant2

Configure in `wrangler.toml`:

```toml
[vars]
BASE_DOMAIN = "auth.example.com"
```

### Analytics Engine Logs

All authentication events are logged to Analytics Engine for:

- Centralized logging across all tenants
- Real-time analytics
- Low-latency writes

## Deployment

1. Deploy to Cloudflare:

   ```bash
   npm run deploy
   ```

2. Run production migrations:

   ```bash
   npm run db:migrate:prod
   ```

3. Set production secrets:
   ```bash
   wrangler secret put CLOUDFLARE_API_TOKEN
   ```

## Project Structure

```
├── src/
│   ├── index.ts           # Worker entry point
│   ├── app.ts             # AuthHero app configuration
│   ├── types.ts           # TypeScript type definitions
│   └── database-factory.ts # Multi-tenant database factory
├── wrangler.toml          # Cloudflare Worker configuration
├── .dev.vars.example      # Example environment variables
└── package.json
```

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
