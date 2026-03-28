---
title: Getting Started
description: Get up and running with AuthHero in minutes using Docker or the create-authhero CLI.
---

# Getting Started

AuthHero is an open-source authentication system compatible with Auth0 APIs. Choose the quickest path to get running:

## Option 1: Docker (Recommended)

The fastest way to try AuthHero. No Node.js required.

```bash
git clone https://github.com/markusahlstrand/authhero.git
cd authhero
docker compose up --build
```

AuthHero is now running at `http://localhost:3000` with:

- Admin login: `admin` / `admin`
- SQLite database (persisted in a Docker volume)
- Management API ready to use

### Configuration

Customize via environment variables in `docker-compose.yml`:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `ISSUER` | `http://localhost:3000/` | Token issuer URL (must match your public URL) |
| `ADMIN_USERNAME` | `admin` | Admin username |
| `ADMIN_PASSWORD` | `admin` | Admin password |
| `SEED` | `true` | Auto-seed database on startup |

::: warning
Change `ADMIN_PASSWORD` before deploying to production.
:::

See [Docker deployment](/deployment/docker) for production configuration with TLS and reverse proxy.

## Option 2: npm create

Scaffold a new project with the interactive CLI:

```bash
npx create-authhero my-auth-app
```

The CLI will guide you through:
1. Choosing a template (`local` for SQLite or `cloudflare` for D1)
2. Setting up an admin user
3. Running migrations and starting the dev server

### Non-Interactive Mode

```bash
npx create-authhero my-app \
  --template local \
  --email admin@example.com \
  --password mypassword123 \
  --yes
```

#### CLI Options

| Option | Description |
| --- | --- |
| `-t, --template <type>` | `local` (SQLite) or `cloudflare` (D1) |
| `-e, --email <email>` | Admin email address |
| `-p, --password <password>` | Admin password (min 8 characters) |
| `--package-manager <pm>` | `npm`, `yarn`, `pnpm`, or `bun` |
| `--multi-tenant` | Enable multi-tenant support (cloudflare only) |
| `-y, --yes` | Skip prompts, use defaults |

## What's Next

Once AuthHero is running:

1. Open the admin dashboard at your server URL
2. Create an application (client) for your app
3. Configure a connection (e.g., email/password)
4. Integrate using any Auth0-compatible SDK

### Learn More

- [Architecture](/architecture/) — Understand how AuthHero works
- [Entities](/entities/) — Tenants, users, applications, connections, and more
- [Auth0 Compatibility](/architecture/auth0-compatibility) — What works the same and what's different
- [Deployment](/deployment/) — Production deployment options
