# create-authhero

`create-authhero` is a command-line tool for creating a new AuthHero project. It supports three different setup types to match your deployment needs.

## Usage

To create a new AuthHero project, run:

```sh
npm create authhero <project-name>
```

If you don't specify a project name, you will be prompted to enter one.

## Interactive Setup

The CLI will guide you through:

1. **Project name** - Name of your project directory
2. **Setup type** - Choose between Local, Cloudflare Simple, or Cloudflare Multi-Tenant
3. **Admin credentials** - Email and password for the initial admin user
4. **Install dependencies** - Optionally install packages with your preferred package manager
5. **Start server** - Optionally run migrations, seed the database, and start the dev server

## Setup Types

When you run the command, you'll be asked to choose from three setup types:

### 1. Local (SQLite)

**Best for:** Getting started, local development, small deployments

- Uses SQLite database with `better-sqlite3`
- Runs with Bun or Node.js
- No external dependencies
- Great for learning and prototyping

```
my-auth-project/
├── src/
│   ├── index.ts     # Server entry point
│   ├── app.ts       # AuthHero configuration
│   ├── migrate.ts   # Database migrations
│   └── seed.ts      # Database seeding (generated)
├── package.json
└── tsconfig.json
```

**Quick Start:**

```sh
cd my-auth-project
npm install
npm run migrate
npm run seed
npm run dev
```

### 2. Cloudflare Simple (Single Tenant)

**Best for:** Single-tenant deployments, simple production setups

- Uses Cloudflare Workers with D1 database
- Single tenant configuration
- Edge deployment with low latency
- Easy to deploy and manage

```
my-auth-project/
├── src/
│   ├── index.ts     # Worker entry point
│   ├── app.ts       # AuthHero configuration
│   └── types.ts     # TypeScript types
├── wrangler.toml    # Cloudflare configuration
├── seed.sql         # Database seeding (generated)
├── package.json
└── tsconfig.json
```

**Quick Start:**

```sh
cd my-auth-project
npm install
wrangler d1 create authhero-db
# Update wrangler.toml with database_id
npm run db:migrate
npm run seed
npm run dev
```

### 3. Cloudflare Multi-Tenant (Production)

**Best for:** SaaS platforms, agencies, enterprise deployments

- Production-grade multi-tenant architecture
- Main D1 database bound to worker (low latency)
- Per-tenant D1 databases created dynamically via REST API
- Analytics Engine for centralized logging
- Subdomain-based tenant routing (optional)
- Organization-based access control

```
my-auth-project/
├── src/
│   ├── index.ts           # Worker entry point
│   ├── app.ts             # AuthHero configuration
│   ├── types.ts           # TypeScript types
│   └── database-factory.ts # Multi-tenant DB factory
├── wrangler.toml          # Cloudflare configuration
├── .dev.vars.example      # Environment variables template
├── seed.sql               # Database seeding (generated)
├── package.json
└── tsconfig.json
```

**Architecture:**

```
                    ┌─────────────────────────────────────────┐
                    │         Cloudflare Worker               │
                    │                                         │
                    │  ┌─────────────────────────────────┐   │
                    │  │   Multi-Tenancy Plugin          │   │
                    │  │   - Access Control              │   │
                    │  │   - Subdomain Routing           │   │
                    │  │   - Database Resolution         │   │
                    │  └─────────────────────────────────┘   │
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

**Quick Start:**

```sh
cd my-auth-project
npm install
wrangler d1 create authhero-main-db
# Update wrangler.toml with database_id
cp .dev.vars.example .dev.vars
# Add your Cloudflare credentials to .dev.vars
npm run db:migrate
npm run seed
npm run dev
```

## Example

```sh
npm create authhero my-auth-project
```

You'll be prompted to:

1. Choose a setup type
2. Enter admin email and password
3. Optionally install dependencies and start the server

## Comparison

| Feature      | Local        | Cloudflare Simple | Cloudflare Multi-Tenant |
| ------------ | ------------ | ----------------- | ----------------------- |
| Database     | SQLite       | D1                | D1 (per-tenant)         |
| Deployment   | Local/Server | Edge              | Edge                    |
| Multi-tenant | ❌           | ❌                | ✅                      |
| Logging      | Console      | Console           | Analytics Engine        |
| Complexity   | Low          | Medium            | High                    |
| Best For     | Development  | Simple Production | Enterprise/SaaS         |

## Documentation

For more information, visit [https://authhero.net/docs](https://authhero.net/docs)

## License

MIT

## Author

Markus Ahlstrand
