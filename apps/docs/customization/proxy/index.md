---
title: Proxy Package
description: A Hono-based reverse proxy for fronting customer custom domains with path-based routing, a small middleware chain, and a database-backed route store.
---

# @authhero/proxy

The `@authhero/proxy` package is a small Cloudflare-Workers-friendly reverse proxy that sits in front of your custom domains. It resolves the inbound `Host` to a tenant via the existing `custom_domains` table, then dispatches each request to one of multiple upstreams based on path-prefix routing rules stored alongside the domain.

## Why a proxy?

If you give customers a custom domain (e.g. `customer.com`) and want different surfaces to live under that hostname — say `customer.com/u/*` for authhero, `customer.com/account/*` for an account app on Vercel, and `customer.com/checkout/*` for a checkout app — without this package they have to set up the custom domain in **three different systems**. With `@authhero/proxy`, the customer registers the domain **once** through AuthHero, and a small worker fans out path prefixes to the right upstreams.

As a bonus, all surfaces share the same origin, so session cookies can be shared across them.

## Features

- 🧭 **Path-prefix routing** — one custom domain, many upstreams, priority-ordered
- 🧩 **Middleware chain** — CORS, header rewrite, basic auth, response cache headers
- 🔌 **Pluggable data adapter** — kysely implementation included; swap in your own (e.g. HTTP-fetch) for cross-database deployments
- 🗄️ **Own migrations** — uses a `kysely_migration_proxy` log table so it can share a database with AuthHero without colliding
- 🚀 **Library-first** — both the data plane and the management API are exposed as Hono router factories you can mount wherever fits your deploy topology

## Installation

```bash
pnpm add @authhero/proxy
```

## Quick start

`@authhero/proxy` is a library, not a service. You write a thin Cloudflare Worker (or any Hono entry) that wires up the data adapter and mounts the routers — the same way you wrap `authhero` in your own app today.

### Minimal Worker

```typescript
// worker.ts
import { Kysely } from "kysely";
import { PlanetScaleDialect } from "kysely-planetscale";
import {
  createKyselyProxyDataAdapter,
  createProxyApp,
  type ProxyDatabase,
} from "@authhero/proxy";

interface Env {
  DATABASE_URL: string;
}

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const db = new Kysely<ProxyDatabase>({
      dialect: new PlanetScaleDialect({ url: env.DATABASE_URL }),
    });
    const app = createProxyApp({
      data: createKyselyProxyDataAdapter(db),
      cacheTtlMs: 30_000,
      management: { auth: yourAuthMiddleware },
    });
    return app.fetch(req, env, ctx);
  },
};
```

That's the whole deploy artifact. `createProxyApp` returns a configured Hono app that handles the data plane on `/*` and (optionally) the management API at `/__proxy/routes`.

## How a request is handled

1. The proxy reads the `Host` (or `x-forwarded-host`) header.
2. It calls `ProxyDataAdapter.resolveHost(host)` to find the matching `custom_domain` and its ordered list of `proxy_routes`. Results are cached in-memory with a configurable TTL (default 30s).
3. It picks the first route whose `path_pattern` matches the request path. Patterns support exact match, `/prefix`, `/prefix/*`, and `/*` (catch-all).
4. It runs the route's middleware chain — CORS preflight handling, basic auth, request header rewriting.
5. It dispatches to the configured upstream:
   - `http` — reverse-proxies to `upstream_url`, optionally preserving the original `Host`
   - `authhero` — same as `http` but semantically marked as the AuthHero hand-off
   - `redirect` — returns a 302 to `upstream_url`
6. It runs the response-side middleware (cache headers, response header rewriting, CORS response headers) and streams the response back.

## Route data model

Each `proxy_route` is a row scoped to a tenant and a custom domain:

| Field              | Type                                | Notes                                                 |
|--------------------|-------------------------------------|-------------------------------------------------------|
| `id`               | string                              | nanoid                                                |
| `tenant_id`        | string                              | scoping                                               |
| `custom_domain_id` | string                              | references the existing `custom_domains` table        |
| `priority`         | int                                 | lower wins; ties broken by `created_at`               |
| `path_pattern`     | string                              | `/`, `/account`, `/checkout/*`, `/api/*`, etc.        |
| `upstream_type`    | `http` \| `authhero` \| `redirect`  | dispatch mode                                         |
| `upstream_url`     | string                              | target URL (`http`/`authhero`) or redirect target     |
| `preserve_host`    | bool                                | when true, forwards the original `Host` to the upstream |
| `middleware`       | JSON array                          | ordered list of `{ type, config }` entries            |

## Built-in middleware

```jsonc
[
  { "type": "cors", "origins": ["https://app.example"], "allow_credentials": true },
  { "type": "headers", "request": { "X-Tenant": "acme" }, "remove_response": ["server"] },
  { "type": "basic_auth", "username": "u", "password": "p", "realm": "Restricted" },
  { "type": "cache", "ttl_seconds": 60 }
]
```

Add new middleware types by extending the `MiddlewareConfig` discriminated union in `@authhero/proxy/types` and registering a handler in the data-plane pipeline.

## Mounting topology

The data plane and the management API are **separate routers**, so you can host them however fits your deploy.

### Recommended: split deployment

For most setups, the management API belongs on your **AuthHero deploy** (one admin API surface, one auth context, one set of CORS rules), while the **data plane runs on its own domain** so it can be operated, scaled, and even owned by a different Cloudflare account.

```typescript
// In your AuthHero worker — admins call /api/v2/proxy-routes
import { createProxyManagementRouter, createKyselyProxyDataAdapter } from "@authhero/proxy";

const proxyData = createKyselyProxyDataAdapter(db);
authheroApp.route(
  "/api/v2/proxy-routes",
  createProxyManagementRouter({ data: proxyData, auth: yourAdminAuth }),
);
```

```typescript
// In your proxy worker (e.g. behind sesamy-dns.com) — no management API exposed
import { createProxyApp, createKyselyProxyDataAdapter } from "@authhero/proxy";

export default {
  fetch(req, env, ctx) {
    const data = createKyselyProxyDataAdapter(makeDb(env.DATABASE_URL));
    return createProxyApp({ data, cacheTtlMs: 30_000 }).fetch(req, env, ctx);
  },
};
```

Both workers can talk to the same database (the proxy needs read-only access to `custom_domains` and read/write on `proxy_routes`), or you can give the proxy its own DB and sync `custom_domains` via webhook.

### All-in-one

Pass `management: { auth }` to `createProxyApp` and both run in the same worker — convenient for local dev or single-customer deploys.

### Standalone admin

Mount only `createProxyManagementRouter` in any Hono app — useful if your admin lives outside AuthHero.

## Database setup

The proxy owns the `proxy_routes` table and runs its own migrations. It reads from the existing `custom_domains` table that AuthHero already manages — so when you share a database with AuthHero, no extra setup is needed for the lookup side.

```typescript
import { runMigrations } from "@authhero/proxy";

await runMigrations(db, { debug: true });
```

Migrations are tracked in a separate log table (`kysely_migration_proxy`) so they don't collide with AuthHero's own migrator.

For deployments that **cannot** share a database with AuthHero (e.g. a different Cloudflare account with a locked-down DB), implement a custom `ProxyDataAdapter` that fetches routes over HTTP from an AuthHero-mounted management endpoint. The router code does not change — only the adapter implementation.

## Deployment

You own the Worker entry, `wrangler.toml`, and secrets — `@authhero/proxy` is a library. The CNAME target customers point to should be stable (Sesamy uses `*.sesamy-dns.com`, mirroring Vercel's `*.vercel-dns.com` convention).

A minimal `wrangler.toml` for the data-plane worker:

```toml
name = "my-proxy"
main = "src/index.ts"
compatibility_date = "2026-05-26"
compatibility_flags = ["nodejs_compat"]
[observability]
enabled = true
```

Secrets and vars:

- `DATABASE_URL` — secret, PlanetScale (or other Kysely-supported) connection string
- `ROUTE_CACHE_TTL_SECONDS` — optional var

To run migrations against your database, expose a tiny script:

```typescript
// migrate.ts
import { runMigrations } from "@authhero/proxy";
import { createDb } from "./db";
const db = createDb(process.env.DATABASE_URL!);
await runMigrations(db, { debug: true });
await db.destroy();
```

## API exports

```typescript
// Types
export type { ProxyRoute, ProxyRouteInsert, ProxyRouteUpdate, MiddlewareConfig } from "@authhero/proxy";

// Adapter interface + types
export type { ProxyDataAdapter, ProxyRoutesAdapter, ResolvedHost } from "@authhero/proxy";

// Kysely implementation
export { createKyselyProxyDataAdapter } from "@authhero/proxy";
export type { ProxyDatabase, ProxyRoutesTable } from "@authhero/proxy";

// App factory (mounts data plane + optional management API)
export { createProxyApp } from "@authhero/proxy";

// Routers (use directly if you need fine-grained control)
export { createProxyDataPlaneRouter } from "@authhero/proxy";
export { createProxyDataPlaneHandler } from "@authhero/proxy";
export { createProxyManagementRouter } from "@authhero/proxy";

// Migrations
export { runMigrations, migrateDown } from "@authhero/proxy";
```
