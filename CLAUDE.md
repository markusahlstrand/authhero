# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Run all apps in parallel (demo, react-admin, docs)
pnpm dev

# Run specific app/package
pnpm demo dev          # Demo auth server at http://localhost:8787
pnpm react-admin dev   # Admin UI
pnpm authhero dev      # Main package
pnpm vitepress dev     # Docs site

# Tests
pnpm test                    # All tests across configured packages
pnpm authhero test           # Main package tests only
pnpm react-admin test        # Admin UI tests only
pnpm kysely test             # Kysely adapter tests only

# Run a single test file (from within a package)
pnpm vitest run src/path/to/file.test.ts

# Formatting
pnpm format

# Changesets (required for version-bumped PRs)
pnpm changeset
```

The `test/routes/` directory contains legacy integration tests excluded from the Vitest workspace — these are being migrated. The `ui-widget` package uses Stencil's own test runner, not Vitest.

## Architecture

This is a **pnpm monorepo** implementing a multi-tenant authentication/IAM system compatible with Auth0 APIs.

### Packages

- **`packages/authhero`** — Core Hono.js HTTP application. Contains all auth routes, login UI (React + TailwindCSS), authentication flows (authorization code, refresh token, device flow, etc.), and state machines. Built with Vite; outputs CJS + ESM bundles. i18n handled at build time via Paraglide.
- **`packages/adapter-interfaces`** — TypeScript interfaces defining the adapter contract (CRUD for tenants, users, clients, connections, etc.). All database adapters must implement these.
- **`packages/kysely`** — Primary database adapter using Kysely ORM. Supports SQLite (local dev), PlanetScale (MySQL), and other SQL databases. ~39 entity modules each handling one domain entity.
- **`packages/drizzle`** — Experimental Drizzle ORM adapter (not production-ready).
- **`packages/cloudflare`** — Cloudflare-specific adapter for custom domain support.
- **`packages/saml`** — SAML 2.0 authentication strategy.
- **`packages/multi-tenancy`** — Multi-tenancy utilities shared across packages.

### Applications

- **`apps/demo`** — Local development server (Hono + Kysely + better-sqlite3). Entry point for testing the full auth stack locally at `http://localhost:8787`.
- **`apps/react-admin`** — Admin UI built with react-admin + React Router v7. Uses Auth0 SPA JS for its own authentication to the admin API.
- **`apps/auth0-proxy`** — Proxy that forwards requests to an Auth0 tenant for migration/compatibility.
- **`apps/docs`** — VitePress documentation site.

### Key Architectural Patterns

**Adapter pattern**: `packages/authhero` depends only on `adapter-interfaces`. Concrete adapters (kysely, drizzle) are injected at runtime. The `createPassthroughAdapter()` utility syncs writes to multiple implementations simultaneously.

**Multi-tenancy**: Every API request is scoped to a tenant. The tenant ID flows through URL paths, request headers, and database queries. All entity CRUD operations accept a `tenantId` parameter.

**Authentication routes in `authhero`**:
- `src/routes/auth-api/` — OAuth2/OIDC endpoints (authorize, token, userinfo, jwks, etc.)
- `src/routes/management-api/` — Tenant management REST API (26+ resource modules)
- `src/routes/universal-login/` — Server-rendered login/signup/MFA UI
- `src/routes/saml/` — SAML SSO endpoints

**React Admin dual-router**:
- Outer router (`src/index.tsx`): domain selection → `/`, tenant management → `/tenants/*`, per-tenant admin → `/:tenantId/*`, auth callback → `/auth-callback`
- Inner router (`src/App.tsx`): react-admin Router with `basename="/:tenantId"` for all resource routes
- Domain config (URL, clientId, API URL) stored in cookies via `src/utils/domainUtils.ts`

### Changesets

Every PR that modifies a versioned package should include a changeset. Run `pnpm changeset`, select affected packages, choose bump type (patch/minor/major), and commit the generated `.changeset/*.md` file with your changes.
