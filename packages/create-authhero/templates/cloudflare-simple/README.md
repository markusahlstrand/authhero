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
- `npm run db:generate` - Generate new migration from schema changes
- `npm run db:push` - Push schema changes directly to database (development only)

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
├── migrations/
│   └── 0000_init.sql     # Initial database schema migration
├── src/
│   ├── db/
│   │   └── schema.ts     # Drizzle schema (for migration generation)
│   ├── index.ts          # Worker entry point
│   ├── app.ts            # AuthHero app configuration
│   ├── seed.ts           # Database seeding worker
│   └── types.ts          # TypeScript type definitions
├── drizzle.config.ts     # Drizzle Kit configuration
├── seed-helper.js        # Helper script for automated seeding
├── wrangler.toml         # Cloudflare Worker configuration
└── package.json
```

## Database Migrations

This project uses [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) for generating database migrations from schema changes.

### Schema-Driven Migrations

The database schema is defined in `src/db/schema.ts` using Drizzle ORM. When you need to make schema changes:

1. **Modify the schema** (if customizing beyond the default AuthHero schema)

2. **Generate a new migration:**

   ```bash
   npm run db:generate
   ```

   This creates a new SQL migration file in the `migrations/` directory.

3. **Apply the migration locally:**

   ```bash
   npm run db:migrate:local
   ```

4. **Apply to production:**
   ```bash
   npm run db:migrate:remote
   ```

### Migration Architecture

- **Drizzle ORM**: Defines the database schema in TypeScript
- **drizzle-kit**: Generates SQL migrations by comparing schema to database state
- **Kysely**: Used at runtime for executing queries (via @authhero/kysely-adapter)

This approach gives you:

- Type-safe schema definitions
- Incremental migrations (only changes are migrated)
- Full control over migration SQL
- Compatibility with Cloudflare D1

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
