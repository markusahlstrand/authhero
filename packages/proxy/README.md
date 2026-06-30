# @authhero/proxy

A multi-tenant HTTP reverse proxy library for [Hono](https://hono.dev). Resolves an incoming request's `Host` header to a tenant, matches against a JSON-configured list of routes (path / method / host / headers / query), and runs each matching route through an ordered chain of handlers — middleware-style transformations followed by a terminal handler that produces the response.

Designed to run on Cloudflare Workers, Node.js, Bun, or any Hono-compatible runtime. This package is data-plane only — proxy route CRUD lives in the `authhero` core (`/api/v2/proxy-routes`), and the underlying schema is shipped by each database adapter (`@authhero/kysely-adapter`, `@authhero/drizzle`, `@authhero/aws-adapter`).

## Install

```bash
pnpm add @authhero/proxy hono @hono/zod-openapi
```

`hono` and `@hono/zod-openapi` are peer dependencies.

## Concepts

A **route** has two parts:

- `match` — `{ hosts?, methods?, path, headers?, query? }`. Path uses Hono's pattern syntax (`/api/*`, `/users/:id`). `hosts` accepts exact or `*.example.com` wildcards. `headers` and `query` are name → regex.
- `handlers` — an ordered array of handler configs. Each handler is `{ type, options }`. The **last** handler is the terminal (it produces the response); earlier handlers wrap it like Hono middleware (`(c, next) => …`).

Built-in handlers:

| Type | Role | What it does |
| --- | --- | --- |
| `cors` | middleware | Replies to OPTIONS preflight; adds CORS headers to the response. |
| `basic_auth` | middleware | Requires a username/password in the `Authorization: Basic` header. |
| `headers` | middleware | Adds/removes request and response headers. |
| `cache` | middleware | Injects `Cache-Control: public, max-age=N` if not already set. |
| `forwarded_headers` | middleware | Sets `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Real-IP`, `X-Original-URL` from CF-Connecting-IP. |
| `rewrite_cookies` | middleware | Rewrites upstream `Set-Cookie: …; Domain=` to the request host. |
| `rewrite_location` | middleware | Rewrites the `Location` header on 3xx responses from upstream origin to request origin. |
| `http` | terminal | Forwards to an HTTP upstream via `fetch`. |
| `service_binding` | terminal | Forwards to a Cloudflare service binding (`env.MY_API.fetch`). |
| `dispatch_namespace` | terminal | Dispatches to a Cloudflare Workers for Platforms namespace (`env.DISPATCHER.get(scriptName).fetch`). `script_name` accepts `{tenant_id}`, `{custom_domain_id}`, `{domain}`, `{host}` placeholders. |
| `redirect` | terminal | Returns a 301/302/307/308 redirect. |
| `static` | terminal | Returns a static body (great for healthchecks). |

Register custom handlers via a `HandlerRegistry`.

## Quick start (static config)

```ts
import { createProxyApp, createStaticProxyAdapter, httpRoute } from "@authhero/proxy";

const data = createStaticProxyAdapter({
  hosts: {
    "acme.example.com": {
      tenant_id: "acme",
      routes: [
        httpRoute("https://acme.vercel.app"),                     // sugar for { match: {path:"/*"}, handlers: [{type:"http",...}] }
        {
          match: { path: "/healthz" },
          handlers: [
            { type: "static", options: { status: 200, json: { ok: true } } },
          ],
        },
        {
          match: { path: "/api/*" },
          handlers: [
            { type: "cors", options: { origins: ["https://app.example.com"] } },
            { type: "http", options: { upstream_url: "https://api.acme.vercel.app" } },
          ],
        },
      ],
    },
  },
});

const app = createProxyApp({ data });
export default app;
```

## Cloudflare service bindings

To dispatch to a service binding (e.g. an internal API Worker), declare it in your Worker entry and pass it to `createProxyApp`:

```ts
export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const app = createProxyApp({
      data: ...,
      bindings: { API2: env.API2 },
    });
    return app.fetch(req);
  },
};
```

Then a route can use:

```ts
{ match: { hosts: ["api.example.com"] }, handlers: [
    { type: "forwarded_headers", options: {} },
    { type: "service_binding", options: { binding: "API2" } },
] }
```

## Dispatching to Workers for Platforms

Route to a per-tenant worker deployed into a Cloudflare dispatch namespace. The script name supports placeholders that are substituted at request time from the resolved host:

```toml
# wrangler.toml
[[dispatch_namespaces]]
binding = "DISPATCHER"
namespace = "authhero-tenants"
```

```ts
// One catch-all route per host dispatches to that tenant's worker.
{ match: { path: "/*" }, handlers: [
    { type: "dispatch_namespace", options: {
        binding: "DISPATCHER",
        script_name: "tenant-{tenant_id}-auth",  // e.g. "tenant-acme-auth"
        // Optional: cpu_ms, subrequests — forwarded to dispatcher.get(...)
    }},
] }
```

Available placeholders: `{tenant_id}`, `{custom_domain_id}`, `{domain}`, `{host}`. The first three come from the resolved host record; `{host}` is the request `Host` header.

## Replacing the upstream-origin in cookies and redirects

The legacy Sesamy proxy rewrote `Set-Cookie: Domain=upstream.example.com` and 3xx `Location: https://upstream.example.com/…` headers so they pointed at the public custom domain. Equivalent with v2:

```ts
{
  match: { path: "/*" },
  handlers: [
    { type: "forwarded_headers", options: {} },
    { type: "rewrite_cookies", options: {} },   // infers upstream host from the http/service_binding handler
    { type: "rewrite_location", options: {} },  // ditto
    { type: "http", options: { upstream_url: "https://upstream.example.com" } },
  ],
}
```

(You can pin `upstream_host` / `upstream_origin` explicitly if you don't want the auto-inference.)

## Dynamic routes (database-backed)

For production, store routes in a database and resolve them per request. AuthHero adapter packages ship a `createProxyDataAdapter(db)` helper that returns a full `ProxyDataAdapter` (CRUD + `resolveHost`) wired to their schema:

```ts
import { Kysely } from "kysely";
import { createProxyApp } from "@authhero/proxy";
import { createProxyDataAdapter } from "@authhero/kysely-adapter";

const db = new Kysely({ /* dialect */ });

const app = createProxyApp({
  data: createProxyDataAdapter(db),
});
```

The `proxy_routes` table comes with the standard AuthHero migrations — running them via `migrateToLatest(db)` (or the equivalent drizzle/aws step) is enough.

## Remote control plane (HTTP adapter)

If the proxy runs separately from the AuthHero control plane (different worker, different VPC, different region), use `createHttpProxyAdapter` to read route config over HTTP:

```ts
import {
  createProxyApp,
  createHttpProxyAdapter,
  createCacheAdapterHostCache,
  createInMemoryHostCache,
} from "@authhero/proxy";
import { createCloudflareCache } from "@authhero/cloudflare-adapter";

const httpAdapter = createHttpProxyAdapter({
  baseUrl: "https://auth.example.com",
  clientId: env.PROXY_CLIENT_ID,
  clientSecret: env.PROXY_CLIENT_SECRET,
});

// Three-tier cache: in-memory (per-isolate) → Cloudflare Cache API (per-colo) → control plane.
const inMemory = createInMemoryHostCache(httpAdapter, { freshTtlMs: 60_000, staleTtlMs: 600_000 });
const resolver = createCacheAdapterHostCache({
  upstream: inMemory,
  cache: createCloudflareCache({ cacheName: "authhero-proxy-hosts" }),
  freshTtlMs: 60 * 60_000,           // 1 hour fresh
  staleTtlMs: 23 * 60 * 60_000,      // SWR for 23 more hours (24h total)
  waitUntil: (p) => ctx.waitUntil(p),
});

const app = createProxyApp({
  data: httpAdapter,
  resolver,                                  // share across requests
  bindings: { API2: env.API2 },
});
```

The HTTP adapter exchanges `client_id` + `client_secret` for an access token at `${baseUrl}/oauth/token`, then calls `GET ${baseUrl}/api/v2/proxy/control-plane/hosts/:host`. The control plane must expose this endpoint with a system-scoped credential (separate from tenant tokens).

## Control-plane endpoint (server side)

In your AuthHero server, opt in by wiring the resolver and pointing at the
JWKS that signs control-plane bearer tokens. Authentication is built in —
authhero verifies the bearer JWT (RS/ES algs, `iss === env.ISSUER`, scope
`proxy:resolve_host`):

```ts
import { init } from "authhero";
import { createProxyDataAdapter } from "@authhero/kysely-adapter";

const proxyData = createProxyDataAdapter(db);

const { app } = init({
  dataAdapter,
  proxyControlPlane: {
    resolveHost: proxyData.resolveHost,
    jwksUrl: `${env.ISSUER}/.well-known/jwks.json`,
    // On Workers, route through a service binding to keep the request
    // off the public network:
    // jwksFetch: (url) => env.JWKS_SERVICE.fetch(url),
  },
});
```

## KV-published read replica (recommended over the bare HTTP adapter)

The HTTP adapter reads routing over a two-hop authenticated call (token mint +
resolve) on every cache miss. To remove that hop from the hot path, have the
control plane **publish** each resolved host blob to a Cloudflare KV namespace,
and have the proxy **read** it with a single, unauthenticated `KV.get`. The
control-plane DB stays the source of truth; KV is a published read replica.

**Proxy side** — `createKvProxyAdapter`, with the HTTP adapter kept as the
miss/error fallback during migration:

```ts
import {
  createProxyApp,
  createKvProxyAdapter,
  createHttpProxyAdapter,
  createCacheAdapterHostCache,
  createInMemoryHostCache,
  type ProxyDataAdapter,
} from "@authhero/proxy";
import { createCloudflareCache } from "@authhero/cloudflare-adapter";

const kv = createKvProxyAdapter({ kv: env.PROXY_HOSTS, timeoutMs: 1000 });
const http = createHttpProxyAdapter({ baseUrl, clientId, clientSecret });

const upstream: ProxyDataAdapter = {
  proxyRoutes: kv.proxyRoutes, // read-only
  async resolveHost(host) {
    try {
      const hit = await kv.resolveHost(host);
      if (hit) return hit;
    } catch {
      /* KV slow/unavailable — fall through */
    }
    return http.resolveHost(host); // miss / error fallback
  },
};

const resolver = createCacheAdapterHostCache({
  upstream: createInMemoryHostCache(upstream, { freshTtlMs: 60_000 }),
  cache: createCloudflareCache({ cacheName: "authhero-proxy-hosts" }),
  freshTtlMs: 60 * 60_000,
  negativeTtlMs: 60_000,
  waitUntil: (p) => ctx.waitUntil(p),
});

createProxyApp({ data: upstream, resolver });
```

**Control-plane side** — wrap the adapters once with
`wrapProxyAdaptersWithKvPublish` (from `authhero`) and pass the wrapped pair to
both the management API and `createApplySyncEvents`, then seed existing hosts
with `backfillProxyHostsToKv`. The KV namespace must live in the **same
Cloudflare account** as the proxy Worker. See the full publish → seed → use guide
in the docs: [Proxy → Shape 3b](https://www.authhero.net/customization/proxy/#shape-3b-—-split-db-kv-published-read-replica-recommended-over-plain-shape-3).

## Host cache

`resolveHost` is called on every request. Wrap it with the built-in stale-while-revalidate cache:

```ts
const app = createProxyApp({
  data,
  cache: {
    freshTtlMs: 5 * 60_000,
    staleTtlMs: 60 * 60_000,
    negativeTtlMs: 30_000,
    waitUntil: (p) => ctx.waitUntil(p),
  },
});
```

On Cloudflare Workers, thread `ExecutionContext.waitUntil` through with `AsyncLocalStorage` so background refreshes survive the response.

## Custom handlers

Define your own handler type:

```ts
import { z } from "@hono/zod-openapi";
import { HandlerRegistry, defineHandler, registerBuiltinHandlers, createProxyApp } from "@authhero/proxy";

const myHandler = defineHandler<{ secret: string }>({
  type: "hmac_verify",
  optionsSchema: z.object({ secret: z.string() }),
  build(options) {
    return async (c, next) => {
      const sig = c.req.header("x-signature");
      if (!sig || !await verify(sig, options.secret, c.req.raw)) {
        return new Response("Bad signature", { status: 401 });
      }
      await next();
    };
  },
});

const registry = new HandlerRegistry();
registerBuiltinHandlers(registry);
registry.add(myHandler);

const app = createProxyApp({ data, registry });
```

## Route schema (zod)

All schemas are re-exported as Zod schemas (`proxyRouteSchema`, `matchSchema`, `handlerConfigSchema`) for validation in your own management UIs.

## Exports

- `createProxyApp(options)` — main Hono app factory
- `createProxyDataPlaneRouter` / `createProxyDataPlaneHandler` — data plane plumbing
- `createStaticProxyAdapter` / `httpRoute` — static config helpers
- `createHttpProxyAdapter` — HTTP control-plane adapter
- `createInMemoryHostCache` / `createCacheAdapterHostCache` — cache layers (`createCacheApiHostCache` is also exported but deprecated in favor of the adapter-based wrapper)
- `HandlerRegistry` / `defineHandler` / `registerBuiltinHandlers` + each builtin handler
- `compileHostApp`, `sortRoutes`, `matchesHost`, `matchesAnyHost`, `buildMatchFilter`

Database-backed adapters live in the AuthHero adapter packages: `@authhero/kysely-adapter`, `@authhero/drizzle`, `@authhero/aws-adapter`.

## License

MIT
