---
title: Proxy Package
description: A Hono-based reverse proxy for fronting customer custom domains with structured route matching, a composable handler chain, and a pluggable data adapter.
---

# @authhero/proxy

The `@authhero/proxy` package is a small Cloudflare-Workers-friendly reverse proxy that sits in front of your custom domains. It resolves the inbound `Host` to a tenant via the existing `custom_domains` table, then runs a per-route _handler chain_ — middleware and a terminal upstream dispatcher — to produce a response.

It also powers the [Cloudflare Workers for Platforms deployment](/deployment/cloudflare-wfp), where the proxy is the **dispatcher Worker** that fans inbound traffic into a dispatch namespace.

## Why a proxy?

Two scenarios drive the design:

1. **Customer-owned custom domains with multiple surfaces.** If you give customers a custom domain (e.g. `customer.com`) and want different surfaces to live under that hostname — `customer.com/u/*` for authhero, `customer.com/account/*` for an account app on Vercel, `customer.com/checkout/*` for a checkout app — without this package they have to set up the custom domain in **three different systems**. With `@authhero/proxy`, the customer registers the domain **once** through AuthHero, and a small Worker fans out path prefixes to the right upstreams.

2. **Workers for Platforms dispatching.** The same proxy is the dispatcher in the WFP topology: resolve the host to a tenant, then `dispatch_namespace.get('tenant-<id>-auth').fetch(request)` into the per-tenant Worker in a dispatch namespace.

In both cases, all surfaces share the same origin so session cookies can be shared across them.

## Features

- 🧭 **Structured route matching** — match on `path`, `methods`, `hosts`, `headers`, `query`; priority-ordered
- 🧩 **Composable handler chain** — 12 built-in handlers covering CORS, auth, header rewrite, caching, and five dispatch modes (`http`, `service_binding`, `dispatch_namespace`, `redirect`, `static`)
- 🔌 **Pluggable data adapter** — static (in-memory), SQL (via `@authhero/kysely-adapter` or `@authhero/drizzle`), or HTTP (via `createHttpProxyAdapter` for cross-account control planes)
- 🗄️ **Shared schema** — the `proxy_routes` table is part of the standard AuthHero migrations
- ⚡ **Built-in host cache** — stale-while-revalidate so `resolveHost` doesn't hit the database on the hot path; also a Cloudflare Cache API variant for cross-instance hits
- 🚀 **Library-first** — both the data plane and the management API are exposed as Hono router factories you can mount wherever fits your deploy topology

## Installation

```bash
pnpm add @authhero/proxy hono @hono/zod-openapi
```

For a SQL-backed data adapter, also install:

```bash
pnpm add @authhero/kysely-adapter kysely
# or
pnpm add @authhero/drizzle drizzle-orm
```

`hono` and `@hono/zod-openapi` are peer dependencies.

## Quick start

`@authhero/proxy` is a library, not a service. You write a thin Cloudflare Worker (or any Hono entry) that wires up a data adapter and mounts the app — the same way you wrap `authhero` in your own app today.

The [`apps/proxy-dev`](https://github.com/markusahlstrand/authhero/tree/main/apps/proxy-dev) Worker in this monorepo is a runnable starting point you can copy from. The [`cloudflare-wfp-dispatcher` template](https://github.com/markusahlstrand/authhero/tree/main/packages/create-authhero/templates/cloudflare-wfp-dispatcher) is the WFP variant.

### Static configuration (no database)

For development or simple deployments, define hosts and routes inline:

```typescript
import { createProxyApp, createStaticProxyAdapter } from "@authhero/proxy";

const data = createStaticProxyAdapter({
  hosts: {
    "acme.example.com": {
      tenant_id: "acme",
      custom_domain_id: "cd-acme",
      routes: [
        {
          priority: 1000,
          match: { path: "/*" },
          handlers: [
            { type: "cors", options: { origins: ["https://app.acme.com"] } },
            { type: "http", options: { upstream_url: "https://acme.vercel.app" } },
          ],
        },
      ],
    },
  },
});

export default createProxyApp({ data });
```

### Database-backed (production, shared DB)

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

### WFP dispatcher (Workers for Platforms)

The most opinionated use case. See [Cloudflare Workers for Platforms](/deployment/cloudflare-wfp) for the full deploy guide; the proxy-side code is:

```typescript
import { drizzle } from "drizzle-orm/d1";
import { createProxyDataAdapter } from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import { createProxyApp, type ResolvedHost } from "@authhero/proxy";

interface Env {
  AUTH_DB: D1Database;
  DISPATCHER: DispatchNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = drizzle(env.AUTH_DB, { schema });
    const base = createProxyDataAdapter(db);

    // Synthesize a default catch-all dispatch route when a host has no
    // explicit proxy_routes rows. Tenants who need custom middleware
    // (CORS, headers, path bypass) just insert real proxy_routes and
    // this fallback gets out of the way.
    const data = {
      proxyRoutes: base.proxyRoutes,
      async resolveHost(host: string): Promise<ResolvedHost | null> {
        const resolved = await base.resolveHost(host);
        if (!resolved || resolved.routes.length > 0) return resolved;
        const now = new Date(0).toISOString();
        return {
          ...resolved,
          routes: [
            {
              id: `default-${resolved.custom_domain_id}`,
              tenant_id: resolved.tenant_id,
              custom_domain_id: resolved.custom_domain_id,
              priority: 1000,
              match: { path: "/*" },
              handlers: [
                {
                  type: "dispatch_namespace",
                  options: {
                    binding: "DISPATCHER",
                    script_name: "tenant-{tenant_id}-auth",
                  },
                },
              ],
              created_at: now,
              updated_at: now,
            },
          ],
        };
      },
    };

    return createProxyApp({
      data,
      bindings: { DISPATCHER: env.DISPATCHER },
    }).fetch(request);
  },
};
```

The `bindings` field is how Cloudflare-only handlers (`dispatch_namespace`, `service_binding`) get access to the Worker's `env` bindings — the proxy is platform-agnostic, so it doesn't reach into a global `env`.

## Host cache

`resolveHost` runs on every request. Two cache implementations ship:

### In-memory (default)

Per-Worker LRU with stale-while-revalidate.

```typescript
import { createProxyApp } from "@authhero/proxy";

createProxyApp({
  data,
  cache: {
    freshTtlMs: 5 * 60_000,        // serve cached for 5 min
    staleTtlMs: 60 * 60_000,       // then SWR for 1 hr
    negativeTtlMs: 30_000,         // cache "not found" briefly
    maxEntries: 10_000,
    waitUntil: (p) => ctx.waitUntil(p), // optional, for background refresh
  },
});
```

On Cloudflare Workers, thread `ExecutionContext.waitUntil` through (e.g. via `AsyncLocalStorage`) so background refreshes survive the response.

### Cloudflare Cache API (cross-instance)

For larger deployments where you want cache hits across Worker isolates:

```typescript
import {
  createProxyApp,
  createCacheApiHostCache,
  buildCacheApiKey,
} from "@authhero/proxy";

const resolver = createCacheApiHostCache(data, {
  freshTtlMs: 5 * 60_000,
  staleTtlMs: 60 * 60_000,
  negativeTtlMs: 30_000,
  cacheName: "authhero-proxy-hosts",
  buildKey: buildCacheApiKey,        // default — `https://__proxy-hosts__/<host>`
  waitUntil: (p) => ctx.waitUntil(p),
});

createProxyApp({ data, resolver });
```

Uses Cloudflare's [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) under the hood, so hits are shared across all instances of the proxy in a given Cloudflare colocation.

## How a request is handled

1. The proxy reads the `Host` (or `x-forwarded-host`) header.
2. It calls `HostResolverCache.resolveHost(host)` (which wraps `ProxyDataAdapter.resolveHost`) to find the matching `custom_domain` and its ordered list of `proxy_routes`.
3. It compiles the per-host route list into a Hono sub-app (memoized via `WeakMap`) and forwards `c.req.raw` to it.
4. The first route whose `match` predicate matches the request is picked. `match` is a structured object:
   - `path` — supports exact match, `/prefix`, `/prefix/*`, and `/*` (catch-all). Defaults to `/*`.
   - `methods` — array of HTTP methods. Omitted = all.
   - `hosts` — restrict the route to specific hostnames (useful for shared `proxy_routes` rows).
   - `headers` / `query` — key-value predicates (all must match).
5. The route's `handlers` array runs in declared order. Each handler is `{ type, options }`; the proxy looks up `type` in the [Handler Registry](#handler-registry) and runs the resulting Hono middleware.
6. The terminal handler (one of `http`, `service_binding`, `dispatch_namespace`, `redirect`, `static`) produces the response. Earlier handlers can short-circuit (e.g. `basic_auth` returns 401 on missing creds) or wrap the response (e.g. `cors`, `headers`, `cache`).

## Route data model

Each `proxy_route` is a row scoped to a tenant and a custom domain:

| Field              | Type                                    | Notes                                                              |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------ |
| `id`               | string                                  | nanoid; accepts caller-supplied for control-plane sync             |
| `tenant_id`        | string                                  | scoping                                                            |
| `custom_domain_id` | string                                  | references the existing `custom_domains` table                     |
| `priority`         | int (default `100`)                     | lower wins; ties broken by `created_at`                            |
| `match`            | JSON object                             | `{ path, methods?, hosts?, headers?, query? }` — see step 4 above  |
| `handlers`         | JSON array (min 1)                      | ordered list of `{ type, options }` entries                        |
| `created_at`       | ISO timestamp                           |                                                                    |
| `updated_at`       | ISO timestamp                           |                                                                    |

The schema is exported as a Zod schema (`proxyRouteSchema`, `proxyRouteInsertSchema`, `proxyRouteUpdateSchema`) so consumers can validate without re-deriving.

Example row (illustrative JSON):

```json
{
  "id": "pr_abc123",
  "tenant_id": "acme",
  "custom_domain_id": "cd_acme",
  "priority": 1000,
  "match": { "path": "/account/*" },
  "handlers": [
    { "type": "cors", "options": { "origins": ["https://app.acme.com"], "allow_credentials": true } },
    { "type": "forwarded_headers", "options": {} },
    { "type": "http", "options": { "upstream_url": "https://account.acme.app", "preserve_host": false } }
  ],
  "created_at": "2026-06-06T00:00:00Z",
  "updated_at": "2026-06-06T00:00:00Z"
}
```

## Built-in handlers

12 handlers ship in `@authhero/proxy` and are registered by `registerBuiltinHandlers(registry)`. Each handler's options are validated against a Zod schema when routes are built (during `HandlerRegistry.build(...)`, called as the per-host route list is compiled) — typos in the JSON fail loudly at route build time, before any request is served.

### Middleware handlers

These wrap the request/response without dispatching. Compose them before a terminal handler.

#### `cors`

CORS preflight + response headers. Validates that wildcard `*` is not combined with `allow_credentials`.

```json
{
  "type": "cors",
  "options": {
    "origins": ["https://app.acme.com", "https://*.acme.com"],
    "allow_credentials": true,
    "allow_headers": ["Authorization", "Content-Type"],
    "allow_methods": ["GET", "POST", "PUT", "DELETE"],
    "expose_headers": ["X-Request-Id"],
    "max_age": 86400
  }
}
```

#### `headers`

Set or remove request/response headers.

```json
{
  "type": "headers",
  "options": {
    "request": { "X-Tenant": "acme" },
    "remove_request": ["cookie"],
    "response": { "X-Powered-By": "AuthHero" },
    "remove_response": ["server", "x-powered-by"]
  }
}
```

#### `basic_auth`

HTTP Basic auth gate.

```json
{
  "type": "basic_auth",
  "options": {
    "username": "ops",
    "password": "<secret>",
    "realm": "AuthHero Internal"
  }
}
```

#### `cache`

Sets `Cache-Control` on the response if not already set. Cookies in the response downgrade visibility to `private`.

```json
{ "type": "cache", "options": { "ttl_seconds": 300 } }
```

#### `forwarded_headers`

Adds `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-Port` based on the incoming request. Use this when the upstream needs to know the original client.

```json
{ "type": "forwarded_headers", "options": {} }
```

#### `rewrite_cookies`

Rewrite cookie `Domain=` attributes on the response. Useful when the upstream sets cookies for its own domain but you want them to land on the custom domain.

#### `rewrite_location`

Rewrite the `Location` header on redirects so upstream-relative redirects become relative to the custom domain instead.

### Terminal handlers

These dispatch the request and produce a response. A route's `handlers` array should end with one of these.

#### `http`

Reverse-proxy to a fully-qualified HTTP(S) URL. Hop-by-hop headers (`connection`, `transfer-encoding`, etc.) are stripped.

```json
{
  "type": "http",
  "options": {
    "upstream_url": "https://account.acme.app",
    "preserve_host": false,
    "timeout_ms": 15000
  }
}
```

#### `service_binding`

Forward to a Cloudflare [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/). Same fetch shape as `http` but bypasses the public network. Requires `bindings: { <name>: env.<name> }` on `createProxyApp`.

```json
{
  "type": "service_binding",
  "options": {
    "binding": "ACCOUNT_API",
    "preserve_host": true
  }
}
```

#### `dispatch_namespace`

Forward to a script in a Cloudflare [dispatch namespace](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/dispatch-namespaces/) — the core of WFP. The script name supports `{tenant_id}`, `{custom_domain_id}`, `{domain}`, `{host}` placeholders.

```json
{
  "type": "dispatch_namespace",
  "options": {
    "binding": "DISPATCHER",
    "script_name": "tenant-{tenant_id}-auth",
    "cpu_ms": 50,
    "subrequests": 100
  }
}
```

`cpu_ms` and `subrequests` cap the script's resource limits (Cloudflare enforces lower bounds at the platform level).

#### `redirect`

Returns a 301/302/307/308 redirect. Defaults to 302.

```json
{
  "type": "redirect",
  "options": {
    "upstream_url": "https://www.acme.com",
    "status": 301,
    "preserve_path": true,
    "preserve_query": true
  }
}
```

#### `static`

Returns a fixed response. Useful for health checks or maintenance pages.

```json
{
  "type": "static",
  "options": {
    "status": 200,
    "headers": { "content-type": "text/plain" },
    "body": "ok"
  }
}
```

`json: <value>` is also accepted as a shorthand for a JSON body.

## Handler registry

Custom handlers extend the built-in set. Register them on a `HandlerRegistry` and pass it to `createProxyApp`:

```typescript
import {
  createProxyApp,
  defineHandler,
  HandlerRegistry,
  registerBuiltinHandlers,
} from "@authhero/proxy";
import { z } from "zod";

const myLoggingHandler = defineHandler({
  type: "logging",
  optionsSchema: z.object({ prefix: z.string().default("[proxy]") }),
  build(options) {
    return async (c, next) => {
      console.log(options.prefix, c.req.method, c.req.url);
      await next();
    };
  },
});

const registry = new HandlerRegistry({ /* bindings */ });
registerBuiltinHandlers(registry);
registry.add(myLoggingHandler);

createProxyApp({ data, registry });
```

Routes can now use `{ "type": "logging", "options": { "prefix": "[acme]" } }`.

## Management API

`@authhero/proxy` is **data-plane only**. CRUD over proxy routes is handled by the regular AuthHero management API at `/api/v2/proxy-routes` (per tenant), exposed automatically whenever your AuthHero data adapter provides a `proxyRoutes` adapter — the default for `@authhero/kysely-adapter`, `@authhero/drizzle`, and `@authhero/aws`.

The admin UI, your scripts, and any other consumer manage routes through the same auth context and CORS rules they already use for the rest of the AuthHero API. There's no separate management router to mount.

## Deployment topology

Two architectural decisions: where the proxy lives, and how it learns about routes.

### Shape 1 — All-in-one

Run the proxy data plane in the same Worker as AuthHero by composing them in a single Hono app. Convenient for local dev or single-customer deploys.

### Shape 2 — Split, shared database (recommended for most production deployments)

```typescript
// AuthHero Worker (your existing deploy)
import { init } from "authhero";
import createAdapters from "@authhero/kysely-adapter";

export default init({
  dataAdapter: createAdapters(db),
});
// → /api/v2/proxy-routes is served here
```

```typescript
// Proxy Worker (separate deploy, may live on a different Cloudflare account)
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

Both Workers point at the same database. The proxy needs read access to `custom_domains` and `proxy_routes`; CRUD writes happen through the AuthHero Worker.

### Shape 3 — Split, separate databases (control-plane HTTP fetch)

When the proxy Worker **cannot** share a database with AuthHero — e.g. the proxy lives in a different Cloudflare account or VPC — fetch routing data over HTTP instead.

#### Proxy side: `createHttpProxyAdapter`

```typescript
import { createProxyApp, createHttpProxyAdapter } from "@authhero/proxy";

interface Env {
  CONTROL_PLANE_URL: string;     // e.g. "https://controlplane.example.com"
  CONTROL_PLANE_CLIENT_ID: string;
  CONTROL_PLANE_CLIENT_SECRET: string;
}

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const data = createHttpProxyAdapter({
      baseUrl: env.CONTROL_PLANE_URL,
      clientId: env.CONTROL_PLANE_CLIENT_ID,
      clientSecret: env.CONTROL_PLANE_CLIENT_SECRET,
      // Optional. Defaults to `${baseUrl}/api/v2/`.
      // audience: `${env.CONTROL_PLANE_URL}/api/v2/`,
      // Optional. Defaults to "/api/v2/proxy/control-plane/hosts/".
      // resolveHostPath: "/api/v2/proxy/control-plane/hosts/",
      timeoutMs: 5000,
    });
    return createProxyApp({ data }).fetch(req, env, ctx);
  },
};
```

The adapter:

- Does a single `client_credentials` grant against `${baseUrl}/oauth/token` and caches the token in-memory.
- Calls `GET ${baseUrl}/api/v2/proxy/control-plane/hosts/:host` on every cache miss, with `Authorization: Bearer <token>`.
- Returns 404 → `null` (so the host cache can record a negative).
- Exposes `proxyRoutes` as read-only — writes throw with a clear message ("mutate via the control-plane management API"). The proxy never needs to write.

The host cache wraps this so each control-plane fetch is amortized across many requests.

#### Control-plane side: outbox-driven sync

The control plane needs the `custom_domains` and `proxy_routes` data. AuthHero's outbox replicates mutations from each tenant shard:

1. A tenant-shard write to `custom_domains` or `proxy_routes` enqueues a `controlplane.sync.{entity}.{op}` event.
2. `ControlPlaneSyncDestination` POSTs each event to `${baseUrl}/api/v2/proxy/control-plane/sync` with an idempotency key.
3. The control plane applies the event via `createApplySyncEvents`. The proxy data plane reads from the control plane's database.

**Tenant shard** (each AuthHero deploy customers hit):

```typescript
import { init, ControlPlaneSyncDestination } from "authhero";

export default init({
  dataAdapter,
  outbox: { enabled: true },
  controlPlaneSync: {
    baseUrl: "https://controlplane.example.com",
    // timeoutMs defaults to 10_000
  },
});
```

**Control plane** (a separate AuthHero instance fronting the proxy's database):

```typescript
import { init, createApplySyncEvents } from "authhero";
import createAdapters from "@authhero/kysely-adapter";

const proxyAdapters = createAdapters(proxyDb);

export default init({
  dataAdapter: proxyAdapters,
  proxyControlPlane: {
    resolveHost: (host) => proxyAdapters.customDomains.resolveHost?.(host) ?? null,
    authenticate: (req) => verifyControlPlaneBearer(req),
    applySyncEvents: createApplySyncEvents({
      customDomains: proxyAdapters.customDomains,
      proxyRoutes: proxyAdapters.proxyRoutes,
    }),
  },
});
```

The receiver is idempotent by construction — it handles duplicate `created` (falls back to `update`), `updated` for a row that doesn't exist locally (falls back to `create`), and `deleted` for a row that's already gone (no-op).

`controlplane.sync.*` events are filtered out by `LogsDestination` and `LogStreamDestination`, so replication traffic does not pollute audit logs.

For the receiver-side config wiring and idempotency semantics in full, see [Control Plane → Proxy entity sync](/customization/multi-tenancy/control-plane#proxy-entity-sync).

### Shape 4 — WFP dispatcher

This is the "proxy as dispatch worker" shape. See [Cloudflare Workers for Platforms](/deployment/cloudflare-wfp) for the full deploy guide. The proxy fronts a dispatch namespace and routes each request into the matching tenant's Worker. The data adapter is typically the same one AuthHero uses, but with a synthetic default route layered on (see [Quick start → WFP dispatcher](#wfp-dispatcher-workers-for-platforms)).

## Database setup

The `proxy_routes` table is part of the standard AuthHero schema and is created by the regular adapter migrations (`migrateToLatest` for `@authhero/kysely-adapter`, the equivalent step for `@authhero/drizzle` and `@authhero/aws`). The proxy reads from the existing `custom_domains` table that AuthHero already manages — so when you share a database with AuthHero, no extra setup is needed at all.

For Shape 3 (split databases), the control-plane instance owns the schema. Run migrations there; the proxy never talks to a database directly.

## Deployment

You own the Worker entry, `wrangler.toml`, and secrets — `@authhero/proxy` is a library. The CNAME target customers point to should be stable (Sesamy uses `*.sesamy-dns.com`, mirroring Vercel's `*.vercel-dns.com` convention).

A minimal `wrangler.toml` for a shared-DB proxy:

```toml
name = "my-proxy"
main = "src/index.ts"
compatibility_date = "2026-05-26"
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true
```

For a WFP dispatcher, add the dispatch namespace binding and the platform D1 — see [Cloudflare Workers for Platforms → Step 1](/deployment/cloudflare-wfp#step-1-set-up-the-dispatcher).

Secrets (shared-DB shape):

- `DATABASE_URL` — PlanetScale (or other Kysely-supported) connection string

Secrets (HTTP control-plane shape):

- `CONTROL_PLANE_URL`
- `CONTROL_PLANE_CLIENT_ID`
- `CONTROL_PLANE_CLIENT_SECRET`

All cache tuning happens in code via the `cache` option on `createProxyApp` (see [Host cache](#host-cache) above).

For a runnable reference deployment, see [`apps/proxy-dev`](https://github.com/markusahlstrand/authhero/tree/main/apps/proxy-dev) in the monorepo. It shows the canonical Cloudflare Workers setup, including threading `ExecutionContext.waitUntil` through `AsyncLocalStorage` so background SWR refreshes survive the response.

## API exports

### From `@authhero/proxy`

```typescript
// App factory — main entry point
export { createProxyApp } from "@authhero/proxy";
export type { ProxyAppOptions } from "@authhero/proxy";

// Data-plane primitives (use directly when embedding in a larger Hono app)
export {
  createProxyDataPlaneRouter,
  createProxyDataPlaneHandler,
} from "@authhero/proxy";
export type { ProxyDataPlaneOptions } from "@authhero/proxy";

// Adapter interface
export type {
  ProxyDataAdapter,
  ProxyRoutesAdapter,
  ResolvedHost,
} from "@authhero/proxy";

// In-memory adapter for static configuration / dev
export { createStaticProxyAdapter, httpRoute } from "@authhero/proxy";
export type {
  StaticProxyAdapterOptions,
  StaticHostConfig,
  StaticRouteInput,
} from "@authhero/proxy";

// HTTP adapter for cross-account / cross-DB proxy deployments
export { createHttpProxyAdapter } from "@authhero/proxy";
export type { HttpProxyAdapterOptions } from "@authhero/proxy";

// Host caches
export { createInMemoryHostCache } from "@authhero/proxy";
export type { HostCacheOptions, HostResolverCache } from "@authhero/proxy";
export {
  createCacheApiHostCache,
  buildCacheApiKey,
} from "@authhero/proxy";
export type { CacheApiHostCacheOptions } from "@authhero/proxy";

// Handler registry and built-in handlers
export {
  HandlerRegistry,
  defineHandler,
  registerBuiltinHandlers,
  corsHandler,
  basicAuthHandler,
  headersHandler,
  cacheHandler,
  forwardedHeadersHandler,
  rewriteCookiesHandler,
  rewriteLocationHandler,
  httpHandler,
  serviceBindingHandler,
  dispatchNamespaceHandler,
  redirectHandler,
  staticHandler,
} from "@authhero/proxy";
export type {
  HandlerDefinition,
  HandlerBuildContext,
} from "@authhero/proxy";

// Matching utilities (exposed for testing and custom data adapters)
export {
  compileHostApp,
  sortRoutes,
  matchesHost,
  matchesAnyHost,
  buildMatchFilter,
} from "@authhero/proxy";

// Re-exported types and Zod schemas (originally from @authhero/adapter-interfaces)
export type {
  ProxyRoute,
  ProxyRouteInsert,
  ProxyRouteUpdate,
  RouteMatch,
  HandlerConfig,
} from "@authhero/proxy";
export {
  proxyRouteSchema,
  proxyRouteInsertSchema,
  proxyRouteUpdateSchema,
  matchSchema,
  handlerConfigSchema,
} from "@authhero/proxy";
```

### From `@authhero/kysely-adapter` / `@authhero/drizzle`

```typescript
// Kysely or Drizzle implementation of ProxyDataAdapter (CRUD + resolveHost)
export { createProxyDataAdapter } from "@authhero/kysely-adapter";
// or
export { createProxyDataAdapter } from "@authhero/drizzle";
```

`@authhero/aws` exposes an equivalent `createProxyDataAdapter` against its own schema.

## Related guides

- [Cloudflare Workers for Platforms deployment](/deployment/cloudflare-wfp) — the proxy as a WFP dispatcher
- [Multi-tenancy architecture](/architecture/multi-tenancy) — how `custom_domains` resolves hosts
- [Control Plane → Proxy entity sync](/customization/multi-tenancy/control-plane#proxy-entity-sync) — outbox replication details for Shape 3
