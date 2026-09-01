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
1. Choosing a template (`local` for SQLite, `cloudflare` for D1, `aws-sst`, or `proxy`)
2. Whether to include the admin UI at `/admin` and enable multi-tenant mode
3. Installing dependencies, running migrations and starting the dev server

The admin user is not created by the CLI. The `local` template serves HTTPS on `https://localhost:3000` with a self-signed certificate; open `/setup` there on first run and the wizard creates the first tenant, the admin user and a `default` application — see [Your first login](/first-login).

### Non-Interactive Mode

```bash
npx create-authhero my-app --template local --yes
```

#### CLI Options

| Option | Description |
| --- | --- |
| `-t, --template <type>` | `local` (SQLite), `cloudflare` (D1), `aws-sst`, or `proxy` |
| `--package-manager <pm>` | `npm`, `yarn`, `pnpm`, or `bun` |
| `--admin-ui` | Serve the admin dashboard at `/admin` (`local` and `cloudflare`) |
| `--multi-tenant` | Enable multi-tenant support |
| `--skip-install` / `--skip-migrate` / `--skip-start` | Stop after scaffolding |
| `-y, --yes` | Skip prompts, use defaults |

## What's Next

**[Your first login](/first-login)** walks through the whole thing end to end on the server you just started: sign in to the admin dashboard at `/admin`, then drive an authorization-code login by hand — `/authorize` in the browser, the universal login screen, and the code exchange at `/oauth/token`.

After that, point your own application at AuthHero: add its callback URL to an application in the dashboard and use any Auth0-compatible SDK.

### Learn More

- [Architecture](/architecture/) — Understand how AuthHero works
- [Entities](/entities/) — Tenants, users, applications, connections, and more
- [Auth0 Compatibility](/architecture/auth0-compatibility) — What works the same and what's different
- [Deployment](/deployment/) — Production deployment options
