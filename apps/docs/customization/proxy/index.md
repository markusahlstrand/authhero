---
title: Proxy Package
description: A Hono-based reverse proxy for fronting customer custom domains with structured route matching, a composable handler chain, and a pluggable data adapter.
---

# @authhero/proxy

The `@authhero/proxy` package is a small Cloudflare-Workers-friendly reverse proxy that sits in front of your custom domains. It resolves the inbound `Host` to a tenant via the existing `custom_domains` table, then runs a per-route _handler chain_ — middleware and a terminal upstream dispatcher — to produce a response.

It also powers the [Cloudflare Workers for Platforms deployment](/deployment/cloudflare-wfp), where the proxy is the **dispatcher Worker** that fans inbound traffic into a dispatch namespace.

## In this section

This page covers the concepts and quick start. The reference material lives on dedicated pages:

- **[Handlers](/customization/proxy/handlers)** — the 12 built-in handlers (CORS, headers, auth, caching, and the five dispatch modes) and how to register custom ones.
- **[Host caching](/customization/proxy/caching)** — in-memory SWR plus the pluggable `CacheAdapter` for cross-isolate hits.
- **[Deployment topologies](/customization/proxy/deployment)** — Shapes 1–4 (all-in-one, shared DB, split DB over HTTP, KV-published read replica, WFP dispatcher), database setup, and `wrangler` config.
- **[API reference](/customization/proxy/api-reference)** — every export from `@authhero/proxy`, the data adapters, and the control-plane KV publisher.

## Why a proxy?

Two scenarios drive the design:

1. **Customer-owned custom domains with multiple surfaces.** If you give customers a custom domain (e.g. `customer.com`) and want different surfaces to live under that hostname — `customer.com/u/*` for authhero, `customer.com/account/*` for an account app on Vercel, `customer.com/checkout/*` for a checkout app — without this package they have to set up the custom domain in **three different systems**. With `@authhero/proxy`, the customer registers the domain **once** through AuthHero, and a small Worker fans out path prefixes to the right upstreams.

2. **Workers for Platforms dispatching.** The same proxy is the dispatcher in the WFP topology: resolve the host to a tenant, then `dispatch_namespace.get('tenant-<id>-auth').fetch(request)` into the per-tenant Worker in a dispatch namespace.

In both cases, all surfaces share the same origin so session cookies can be shared across them.

## Features

- 🧭 **Structured route matching** — match on `path`, `methods`, `hosts`, `headers`, `query`; priority-ordered
- 🧩 **Composable handler chain** — 12 built-in handlers covering CORS, auth, header rewrite, caching, and five dispatch modes (`http`, `service_binding`, `dispatch_namespace`, `redirect`, `static`)
- 🔌 **Pluggable data adapter** — static (in-memory), SQL (via `@authhero/kysely-adapter` or `@authhero/drizzle`), HTTP (via `createHttpProxyAdapter` for cross-account control planes), or Cloudflare KV (via `createKvProxyAdapter` — a published read replica, see [Shape 3b](/customization/proxy/deployment#shape-3b-split-db-kv-published-read-replica-recommended-over-plain-shape-3))
- 🗄️ **Shared schema** — the `proxy_routes` table is part of the standard AuthHero migrations
- ⚡ **Built-in host cache** — stale-while-revalidate so `resolveHost` doesn't hit the database on the hot path; layer in any `CacheAdapter` (Cloudflare, Redis, …) for cross-instance hits
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

## How a request is handled

1. The proxy reads the `Host` (or `x-forwarded-host`) header.
2. It calls `HostResolverCache.resolveHost(host)` (which wraps `ProxyDataAdapter.resolveHost`) to find the matching `custom_domain` and its ordered list of `proxy_routes`.
3. It compiles the per-host route list into a Hono sub-app (memoized via `WeakMap`) and forwards `c.req.raw` to it.
4. The first route whose `match` predicate matches the request is picked. `match` is a structured object:
   - `path` — supports exact match, `/prefix`, `/prefix/*`, and `/*` (catch-all). Defaults to `/*`.
   - `methods` — array of HTTP methods. Omitted = all.
   - `hosts` — restrict the route to specific hostnames (useful for shared `proxy_routes` rows).
   - `headers` / `query` — key-value predicates (all must match).
5. The route's `handlers` array runs in declared order. Each handler is `{ type, options }`; the proxy looks up `type` in the [handler registry](/customization/proxy/handlers#handler-registry) and runs the resulting Hono middleware.
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

## Management API

`@authhero/proxy` is **data-plane only**. CRUD over proxy routes is handled by the regular AuthHero management API at `/api/v2/proxy-routes` (per tenant), exposed automatically whenever your AuthHero data adapter provides a `proxyRoutes` adapter — the default for `@authhero/kysely-adapter`, `@authhero/drizzle`, and `@authhero/aws`.

The admin UI, your scripts, and any other consumer manage routes through the same auth context and CORS rules they already use for the rest of the AuthHero API. There's no separate management router to mount.

## Related guides

- [Handlers](/customization/proxy/handlers) — built-in handler reference and the handler registry
- [Host caching](/customization/proxy/caching) — host-resolution cache tuning
- [Deployment topologies](/customization/proxy/deployment) — Shapes 1–4, database setup, and `wrangler` config
- [API reference](/customization/proxy/api-reference) — all package exports
- [Custom Domain Setup](/deployment/custom-domain-setup) — DNS, TLS, and how customer custom domains route to this proxy
- [Custom Domains Adapter](/customization/cloudflare-adapter/custom-domains) — provisioning TLS/hostnames for the domains the proxy resolves
- [Cloudflare Workers for Platforms deployment](/deployment/cloudflare-wfp) — the proxy as a WFP dispatcher
- [Multi-tenancy architecture](/architecture/multi-tenancy) — how `custom_domains` resolves hosts, and how the proxy fits the bigger picture
- [Control Plane → Proxy entity sync](/customization/multi-tenancy/control-plane#proxy-entity-sync) — outbox replication details for Shape 3
