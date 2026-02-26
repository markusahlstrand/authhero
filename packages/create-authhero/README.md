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
3. **GitHub CI** - (Cloudflare only) Optionally include GitHub Actions workflows with semantic versioning
4. **Admin credentials** - Email and password for the initial admin user
5. **Install dependencies** - Optionally install packages with your preferred package manager
6. **Start server** - Optionally run migrations, seed the database, and start the dev server

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
│   ├── index.ts          # Worker entry point
│   ├── app.ts            # AuthHero configuration
│   └── types.ts          # TypeScript types
├── wrangler.toml         # Base Cloudflare config (safe for git)
├── wrangler.local.toml   # Your private IDs (gitignored)
├── .dev.vars             # Local secrets (gitignored)
├── .dev.vars.example     # Template for .dev.vars
├── seed.sql              # Database seeding (generated)
├── package.json
└── tsconfig.json
```

**Quick Start (Local Development):**

```sh
cd my-auth-project
npm install
npm run migrate
npm run seed
npm run dev
```

**Remote Development (Your Cloudflare Account):**

```sh
# Create a D1 database
npx wrangler d1 create authhero-db
# Copy the database_id to wrangler.local.toml
npm run db:migrate:remote
npm run dev:remote
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
│   ├── index.ts            # Worker entry point
│   ├── app.ts              # AuthHero configuration
│   ├── types.ts            # TypeScript types
│   └── database-factory.ts # Multi-tenant DB factory
├── wrangler.toml           # Base Cloudflare config (safe for git)
├── wrangler.local.toml     # Your private IDs (gitignored)
├── .dev.vars               # Local secrets (gitignored)
├── .dev.vars.example       # Environment variables template
├── seed.sql                # Database seeding (generated)
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

**Quick Start (Local Development):**

```sh
cd my-auth-project
npm install
npm run migrate
npm run seed
npm run dev
```

**Remote Development (Your Cloudflare Account):**

```sh
# Create a D1 database
npx wrangler d1 create authhero-db
# Copy the database_id to wrangler.local.toml
# Optionally add CLOUDFLARE_ACCOUNT_ID to .dev.vars
npm run db:migrate:remote
npm run dev:remote
```

## Security & Privacy

Cloudflare projects are designed to be **open-source friendly**:

| File                  | Purpose                            | In Git? |
| --------------------- | ---------------------------------- | ------- |
| `wrangler.toml`       | Base config (safe for public repo) | ✅ Yes  |
| `wrangler.local.toml` | Your private IDs (database_id)     | ❌ No   |
| `.dev.vars`           | Local secrets (API tokens, etc.)   | ❌ No   |
| `.dev.vars.example`   | Template for .dev.vars             | ✅ Yes  |

The CLI automatically creates `wrangler.local.toml` and `.dev.vars` from the templates when you create a project. Simply update them with your Cloudflare IDs.

### GitHub Actions / CI Deployment

For automated deployments, set these GitHub Secrets:

| Secret                  | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with Workers permissions                       |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (optional, for some features) |

The wrangler GitHub Action will automatically use these secrets. No need to store IDs in your repo!

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

## GitHub CI with Semantic Versioning

For Cloudflare setups, you can optionally include GitHub Actions workflows that provide:

- **Unit Tests**: Runs on all pushes to any branch
- **Deploy to Dev**: Automatically deploys to dev environment on push to `main`, with semantic-release for version management
- **Deploy to Production**: Deploys to production when a GitHub release is published

### CI/CD Flow

```
All PRs/Pushes → Unit Tests (type-check + tests)
Push to main  → Semantic Release + Deploy to Dev
GitHub Release → Deploy to Production
```

### Required GitHub Secrets

| Secret                      | Description                              |
| --------------------------- | ---------------------------------------- |
| `CLOUDFLARE_API_TOKEN`      | API token for dev deployments            |
| `CLOUDFLARE_ACCOUNT_ID`     | Account ID (optional, for some features) |
| `PROD_CLOUDFLARE_API_TOKEN` | API token for production deployments     |

> **Note:** You do NOT need to store `database_id` or `zone_id` in your repo or secrets. Wrangler resolves these automatically when deploying with the correct API token.

### Commit Message Conventions

Use conventional commits for automatic versioning:

- `fix:` → Patch release (1.0.0 → 1.0.1)
- `feat:` → Minor release (1.0.0 → 1.1.0)
- `BREAKING CHANGE:` → Major release (1.0.0 → 2.0.0)

## Documentation

For more information, visit [https://authhero.net/docs](https://authhero.net/docs)

## License

MIT

## Author

Markus Ahlstrand
