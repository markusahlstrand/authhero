# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Run all apps in parallel (demo, admin, docs)
pnpm dev

# Run specific app/package
pnpm demo dev          # Demo auth server at http://localhost:8787
pnpm admin dev         # Admin UI
pnpm authhero dev      # Main package
pnpm vitepress dev     # Docs site

# Tests
pnpm test                    # All tests across configured packages
pnpm authhero test           # Main package tests only
pnpm admin test              # Admin UI tests only
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
- **`packages/kysely`** — Kysely ORM adapter for PlanetScale (MySQL) and other SQL databases. Kept while PlanetScale runs in production; new deployments should use drizzle. ~39 entity modules each handling one domain entity.
- **`packages/drizzle`** — Primary database adapter (Drizzle ORM, SQLite/D1). Used by all create-authhero templates; ships pre-generated migrations in `drizzle/`.
- **`packages/cloudflare`** — Cloudflare-specific adapter for custom domain support.
- **`packages/saml`** — SAML 2.0 authentication strategy.
- **`packages/multi-tenancy`** — Multi-tenancy utilities shared across packages.
- **`packages/proxy`** — Hono-based multi-tenant reverse proxy library. Resolves the `Host` header to a tenant via `custom_domains`, then dispatches each request to one of multiple upstreams based on path-prefix routes with per-route middleware (CORS, headers, basic auth, cache).
- **`packages/ui-widget`** — Stencil web component that renders server-driven auth screens following the Auth0 Forms schema (types live in `adapter-interfaces`).
- **`packages/aws`** — DynamoDB adapter.
- **`packages/create-authhero`** — CLI scaffolder for new AuthHero projects.

### Applications

- **`apps/demo`** — Local development server (Hono + Kysely + better-sqlite3). Entry point for testing the full auth stack locally at `http://localhost:8787`.
- **`apps/admin`** — Admin UI built on `ra-core` (the headless half of react-admin) with shadcn/ui and Tailwind v4. Uses Auth0 SPA JS for its own authentication to the admin API.
- **`apps/proxy-dev`** — Cloudflare Worker harness for developing/deploying `@authhero/proxy`.
- **`apps/docs`** — VitePress documentation site.
- **`apps/website`** — Public marketing site (Vite + React SSG, Cloudflare Pages).
- **`apps/conformance-auth-server`** / **`apps/conformance-runner`** — Local AuthHero server plus Playwright runner for the OpenID Foundation conformance suite.

Packages with non-obvious conventions have their own `CLAUDE.md` (currently `apps/admin` and `packages/ui-widget`).

### Key Architectural Patterns

**Adapter pattern**: `packages/authhero` depends only on `adapter-interfaces`. Concrete adapters (kysely, drizzle) are injected at runtime. The `createPassthroughAdapter()` utility syncs writes to multiple implementations simultaneously.

**Multi-tenancy**: Every API request is scoped to a tenant. The tenant ID flows through URL paths, request headers, and database queries. All entity CRUD operations accept a `tenantId` parameter.

**Authentication routes in `authhero`**:

- `src/routes/auth-api/` — OAuth2/OIDC endpoints (authorize, token, userinfo, jwks, etc.)
- `src/routes/management-api/` — Tenant management REST API (26+ resource modules)
- `src/routes/universal-login/` — Server-rendered login/signup/MFA UI
- `src/routes/saml/` — SAML SSO endpoints

**Admin UI dual-router** (`apps/admin`):

- Outer router (`src/index.tsx`): domain selection → `/`, tenant management → `/tenants/*`, per-tenant admin → `/:tenantId/*`, auth callback → `/auth-callback`
- Inner router (`src/App.tsx`): react-admin Router with `basename="/:tenantId"` for all resource routes
- Domain config (URL, clientId, API URL) stored in cookies via `src/utils/domainUtils.ts`

### Changesets

Every PR that modifies a versioned package should include a changeset. Run `pnpm changeset`, select affected packages, choose bump type (patch/minor/major), and commit the generated `.changeset/*.md` file with your changes.
