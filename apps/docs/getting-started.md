# Getting Started with AuthHero

This guide will help you get started with AuthHero in your project.

## Prerequisites

- Node.js (version 16 or higher)
- npm, yarn, pnpm, or bun package manager

## Quick Start

The fastest way to get started is using the `create-authhero` CLI:

```bash
npx create-authhero my-auth-app
```

This interactive CLI will guide you through:
1. Choosing a template (local, cloudflare-simple, or cloudflare-multitenant)
2. Installing dependencies
3. Running database migrations
4. Seeding an admin user
5. Starting the development server

### Non-Interactive Mode

You can also use CLI options for automated setups:

```bash
# Create a local SQLite project
npx create-authhero my-app \
  --template local \
  --email admin@example.com \
  --password mypassword123

# Create a Cloudflare D1 project with pnpm
npx create-authhero my-cf-app \
  --template cloudflare-simple \
  --email admin@example.com \
  --password mypassword123 \
  --package-manager pnpm

# Skip interactive prompts and auto-install
npx create-authhero my-app \
  --template local \
  --email admin@example.com \
  --password mypassword123 \
  --yes
```

#### Available CLI Options

- `-t, --template <type>` - Template: `local`, `cloudflare-simple`, or `cloudflare-multitenant`
- `-e, --email <email>` - Admin email address
- `-p, --password <password>` - Admin password (min 8 characters)
- `--package-manager <pm>` - Package manager: `npm`, `yarn`, `pnpm`, or `bun`
- `--skip-install` - Skip installing dependencies
- `--skip-migrate` - Skip running database migrations
- `--skip-seed` - Skip seeding the database
- `--skip-start` - Skip starting the development server
- `--remote` - Use remote mode for cloudflare-simple (production D1)
- `-y, --yes` - Skip all prompts and use defaults/provided options

## Manual Installation

Install the AuthHero package in your existing project:

```bash
pnpm install authhero
```

## Template Options

### Local (SQLite)
Best for local development and getting started quickly. Uses SQLite database with better-sqlite3.

### Cloudflare Simple (Single Tenant)
Single-tenant setup with Cloudflare Workers and D1 database. Perfect for production deployments with a single organization.

### Cloudflare Multi-Tenant (Production)
Production-grade multi-tenant setup with per-tenant D1 databases and Analytics Engine. Ideal for SaaS applications.

## Running Your First AuthHero Project

```bash
# Navigate to your project
cd my-auth-app

# Install dependencies (if not already installed)
pnpm install

# Run migrations
pnpm run migrate

# Seed the database
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword pnpm run seed

# Start the development server
pnpm dev
```

## Next Steps

- Explore the [architecture](architecture.md) to understand how AuthHero works
- Learn about the [key concepts](concepts.md) of authentication with AuthHero
- Understand [session management](session-management.md) and how login sessions work
- Check out the guides for specific use cases
