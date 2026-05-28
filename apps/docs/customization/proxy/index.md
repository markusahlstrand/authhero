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
- 🔌 **Pluggable data adapter** — static (in-memory) and SQL (via [`@authhero/kysely-adapter`](https://npmjs.com/package/@authhero/kysely-adapter)); swap in your own (e.g. HTTP-fetch) for cross-database deployments
- 🗄️ **Shared schema** — the `proxy_routes` table is part of the standard AuthHero migrations, so a proxy worker sharing the AuthHero database has nothing extra to migrate
- ⚡ **Built-in host cache** — stale-while-revalidate so `resolveHost` doesn't hit the database on the hot path
- 🚀 **Library-first** — both the data plane and the management API are exposed as Hono router factories you can mount wherever fits your deploy topology

## Installation

```bash
pnpm add @authhero/proxy hono @hono/zod-openapi
```

For a SQL-backed data adapter, also install:

```bash
pnpm add @authhero/kysely-adapter kysely
```

`hono`, `@hono/zod-openapi` (and `kysely` for the SQL adapter) are peer dependencies.

## Quick start

`@authhero/proxy` is a library, not a service. You write a thin Cloudflare Worker (or any Hono entry) that wires up a data adapter and mounts the app — the same way you wrap `authhero` in your own app today.

The [`apps/proxy-dev`](https://github.com/markusahlstrand/authhero/tree/main/apps/proxy-dev) Worker in this monorepo is a runnable starting point you can copy from.

### Static configuration (no database)

For development or simple deployments, define hosts inline:

```typescript
import { createProxyApp, createStaticProxyAdapter } from "@authhero/proxy";

const data = createStaticProxyAdapter({
  hosts: {
    "acme.example.com": {
      tenant_id: "acme",
      routes: [
        {
          path_pattern: "/*",
          upstream_type: "http",
          upstream_url: "https://acme.vercel.app",
        },
      ],
    },
  },
});

export default createProxyApp({ data });
```

### Database-backed (production)

```typescript
// worker.ts
import { Kysely } from "kysely";
import { PlanetScaleDialect } from "kysely-planetscale";
import { createProxyApp } from "@authhero/proxy";
import { createProxyDataAdapter } from "@authhero/kysely-adapter";
import type { Database } from "@authhero/kysely-adapter";

interface Env {
  DATABASE_URL: string;
}

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const db = new Kysely<Database>({
      dialect: new PlanetScaleDialect({ url: env.DATABASE_URL }),
    });
    const app = createProxyApp({
      data: createProxyDataAdapter(db),
      cache: { freshTtlMs: 5 * 60_000, staleTtlMs: 60 * 60_000 },
    });
    return app.fetch(req, env, ctx);
  },
};
```

That's the whole deploy artifact. `createProxyApp` returns a configured Hono app that handles the data plane on `/*`. Route CRUD is exposed by your AuthHero server at `/api/v2/proxy-routes`.

### Host cache

`resolveHost` runs on every request. The built-in stale-while-revalidate cache keeps it off the hot path:

```typescript
createProxyApp({
  data,
  cache: {
    freshTtlMs: 5 * 60_000,    // serve cached for 5 min
    staleTtlMs: 60 * 60_000,   // then SWR for 1 hr
    negativeTtlMs: 30_000,     // cache "not found" briefly
    waitUntil: (p) => ctx.waitUntil(p), // optional, for background refresh
  },
});
```

On Cloudflare Workers, thread `ExecutionContext.waitUntil` through (e.g. via `AsyncLocalStorage`) so background refreshes survive the response.

## How a request is handled

1. The proxy reads the `Host` (or `x-forwarded-host`) header.
2. It calls `ProxyDataAdapter.resolveHost(host)` to find the matching `custom_domain` and its ordered list of `proxy_routes`. The built-in stale-while-revalidate cache wraps this so the database is off the hot path.
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

Add new middleware types by extending the `MiddlewareConfig` discriminated union in `@authhero/adapter-interfaces` and registering a handler in the data-plane pipeline.

## Where the management API lives

`@authhero/proxy` is **data-plane only**. CRUD over proxy routes is handled by the regular AuthHero management API at `/api/v2/proxy-routes` (per tenant), and is automatically exposed whenever your AuthHero data adapter provides a `proxyRoutes` adapter — which is the default for `@authhero/kysely-adapter`, `@authhero/drizzle`, and `@authhero/aws`.

This means the admin UI, your scripts, and any other consumer manage routes through the same auth context and CORS rules they already use for the rest of the AuthHero API. There's no separate management router to mount.

## Deployment topology

Because the data plane and the management API are decoupled by the database, you have two natural deploy shapes:

### Split (recommended)

```typescript
// AuthHero worker (your existing deploy)
import { init } from "authhero";
import createAdapters from "@authhero/kysely-adapter";

export default init({
  dataAdapter: createAdapters(db),
});
// → /api/v2/proxy-routes is served here
```

```typescript
// Proxy worker (e.g. behind sesamy-dns.com — separate deploy, possibly a different Cloudflare account)
import { createProxyApp } from "@authhero/proxy";
import { createProxyDataAdapter } from "@authhero/kysely-adapter";

export default {
  fetch(req, env, ctx) {
    const data = createProxyDataAdapter(makeDb(env.DATABASE_URL));
    return createProxyApp({ data }).fetch(req, env, ctx);
  },
};
// → handles customer traffic on /*
```

Both workers point at the same database. The proxy needs read access to `custom_domains` and `proxy_routes`; CRUD writes happen through the AuthHero worker.

### All-in-one

Run the proxy data plane in the same worker as AuthHero by composing them in a single Hono app — convenient for local dev or single-customer deploys.

## Database setup

The `proxy_routes` table is part of the standard AuthHero schema and is created by the regular adapter migrations (`migrateToLatest` for `@authhero/kysely-adapter`, the equivalent step for `@authhero/drizzle` and `@authhero/aws`). The proxy reads from the existing `custom_domains` table that AuthHero already manages — so when you share a database with AuthHero, no extra setup is needed at all.

For deployments that **cannot** share a database with AuthHero (e.g. a different Cloudflare account with a locked-down DB), implement a custom `ProxyDataAdapter` that fetches routes over HTTP from `/api/v2/proxy-routes` on your AuthHero server. The router code does not change — only the adapter implementation.

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

Secrets:

- `DATABASE_URL` — PlanetScale (or other Kysely-supported) connection string

All cache tuning happens in code via the `cache` option on `createProxyApp` (see [Host cache](#host-cache) above).

Migrations are owned by your AuthHero server — when it runs `migrateToLatest`, the `proxy_routes` table is created alongside the rest of the AuthHero schema. There's no separate proxy migration step.

For a runnable reference deployment, see [`apps/proxy-dev`](https://github.com/markusahlstrand/authhero/tree/main/apps/proxy-dev) in the monorepo. It shows the canonical Cloudflare Workers setup, including threading `ExecutionContext.waitUntil` through `AsyncLocalStorage` so background SWR refreshes survive the response.

## API exports

### From `@authhero/proxy`

```typescript
// App factory — main entry point
export { createProxyApp } from "@authhero/proxy";
export type { ProxyAppOptions } from "@authhero/proxy";

// Adapter interface
export type {
  ProxyDataAdapter,
  ProxyRoutesAdapter,
  ResolvedHost,
} from "@authhero/proxy";

// In-memory adapter for static configuration / dev
export { createStaticProxyAdapter } from "@authhero/proxy";
export type {
  StaticProxyAdapterOptions,
  StaticHostConfig,
  StaticRouteInput,
} from "@authhero/proxy";

// Data-plane primitives (use directly when embedding in a larger Hono app)
export {
  createProxyDataPlaneRouter,
  createProxyDataPlaneHandler,
} from "@authhero/proxy";

// Host cache (also wired into createProxyApp via the `cache` option)
export { createInMemoryHostCache } from "@authhero/proxy";
export type { HostCacheOptions, HostResolverCache } from "@authhero/proxy";

// Re-exported types and Zod schemas (originally from @authhero/adapter-interfaces)
export type {
  ProxyRoute,
  ProxyRouteInsert,
  ProxyRouteUpdate,
  MiddlewareConfig,
} from "@authhero/proxy";
export {
  proxyRouteSchema,
  proxyRouteInsertSchema,
  proxyRouteUpdateSchema,
  middlewareConfigSchema,
} from "@authhero/proxy";
```

### From `@authhero/kysely-adapter`

```typescript
// Kysely implementation of ProxyDataAdapter (CRUD + resolveHost)
export { createProxyDataAdapter } from "@authhero/kysely-adapter";
```

`@authhero/drizzle` and `@authhero/aws` expose an equivalent `createProxyDataAdapter` against their own schemas.
