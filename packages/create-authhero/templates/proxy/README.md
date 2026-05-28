# AuthHero Proxy

A Cloudflare Worker that proxies incoming requests to upstream services based on the request's `Host` header. Built on [@authhero/proxy](https://www.npmjs.com/package/@authhero/proxy).

This template ships with a static, in-file config so you can run it immediately. For production you'll typically swap that adapter for one that reads routes from your authhero deployment — see [Data sources](#data-sources) below.

## Configure your routes (default)

Edit [src/proxy.config.ts](src/proxy.config.ts) to map each public hostname to one or more upstream routes. Path patterns support `*` and `:param` segments, and routes are matched in priority order (lower wins).

```ts
export const proxyConfig: StaticProxyAdapterOptions = {
  hosts: {
    "id.example.com": {
      tenant_id: "example",
      routes: [
        {
          path_pattern: "/*",
          upstream_type: "http",
          upstream_url: "https://upstream.example.com",
        },
      ],
    },
  },
};
```

## Data sources

The proxy reads its routes through a `ProxyDataAdapter`. Three implementations are common:

| Adapter | Best for | Notes |
| --- | --- | --- |
| **Static** (default) | Local dev, small fixed deployments | Routes baked into the worker bundle; re-deploy to change them. |
| **Database** | Same-process or co-located deployments | Reads directly from the proxy_routes table that authhero writes to. |
| **HTTP / management API** | Geographically distributed proxies, hosted Workers | Calls `/api/v2/proxy-routes` on your authhero server with a service token. |

The authhero server exposes the management API (`/api/v2/proxy-routes`) and creates the underlying table automatically once the standard adapter migrations have run — see the `local` template's [src/index.ts](../local/src/index.ts).

### Database-backed (Kysely)

Add the adapter and your Kysely driver, then swap the data line:

```bash
npm install @authhero/kysely-adapter kysely
```

```ts
import { Kysely } from "kysely";
import { createProxyApp } from "@authhero/proxy";
import { createProxyDataAdapter } from "@authhero/kysely-adapter";

const db = new Kysely({ dialect: /* your dialect */ });
const app = createProxyApp({
  data: createProxyDataAdapter(db),
});
```

Cloudflare Workers can't open SQLite files, so on Workers this path means D1, Hyperdrive, or a remote MySQL/Postgres. For a local Node process, `better-sqlite3` pointing at the same `db.sqlite` your authhero server uses works out of the box.

### HTTP-backed (management API)

The proxy authenticates to authhero's management API with a service token. Issue the token from authhero with the scopes `read:proxy_routes` and `read:custom_domains`, then store it as a worker secret:

```bash
wrangler secret put AUTHHERO_SERVICE_TOKEN
```

`wrangler.toml` vars:

```toml
[vars]
AUTHHERO_API_URL = "https://auth.example.com"
AUTHHERO_TENANT_ID = "example"
```

Then build an adapter that resolves the host via `/api/v2/custom-domains` and the routes via `/api/v2/proxy-routes`:

```ts
import type { ProxyDataAdapter, ResolvedHost } from "@authhero/proxy";

interface Env {
  AUTHHERO_API_URL: string;
  AUTHHERO_TENANT_ID: string;
  AUTHHERO_SERVICE_TOKEN: string;
}

function createHttpProxyAdapter(env: Env): ProxyDataAdapter {
  const headers = {
    "authorization": `Bearer ${env.AUTHHERO_SERVICE_TOKEN}`,
    "tenant-id": env.AUTHHERO_TENANT_ID,
  };

  async function api<T>(path: string): Promise<T> {
    const res = await fetch(`${env.AUTHHERO_API_URL}${path}`, { headers });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json() as Promise<T>;
  }

  return {
    // The proxy data plane only needs resolveHost; the CRUD methods on
    // proxyRoutes stay unused (writes always go through authhero directly).
    proxyRoutes: {
      list: () => { throw new Error("read-only proxy adapter"); },
      get: () => { throw new Error("read-only proxy adapter"); },
      create: () => { throw new Error("read-only proxy adapter"); },
      update: () => { throw new Error("read-only proxy adapter"); },
      remove: () => { throw new Error("read-only proxy adapter"); },
    },
    async resolveHost(host): Promise<ResolvedHost | null> {
      const domains = await api<{ custom_domains: Array<{
        custom_domain_id: string; domain: string;
      }> }>("/api/v2/custom-domains");
      const match = domains.custom_domains.find((d) => d.domain === host);
      if (!match) return null;

      const routes = await api<{ proxy_routes: unknown[] }>(
        `/api/v2/proxy-routes?custom_domain_id=${match.custom_domain_id}&per_page=200`,
      );
      return {
        tenant_id: env.AUTHHERO_TENANT_ID,
        custom_domain_id: match.custom_domain_id,
        domain: host,
        routes: routes.proxy_routes as ResolvedHost["routes"],
      };
    },
  };
}
```

Cache aggressively (see below) — every cold cache miss is two API round-trips.

## Caching

Resolved hosts are cached in-memory per Worker isolate with a stale-while-revalidate strategy:

- **Fresh** for 5 minutes — served directly from cache.
- **Stale** for the next hour — served from cache while a background refresh runs.
- **Negative** (host not found) — cached for 30 seconds so newly-added hosts come online quickly.

For the static adapter the "refresh" is just a re-read of the in-memory config, so the SWR window mainly matters when you swap to the HTTP- or database-backed adapter.

## Develop locally

```bash
npm run dev
```

The worker is served at `http://localhost:8787`. To exercise a specific host, send the `Host` header:

```bash
curl http://localhost:8787/login -H "Host: id.example.com"
```

## Deploy

```bash
npm run deploy
```

Add a custom-domain route in `wrangler.toml` for each hostname you've configured, or attach the worker to existing routes in the Cloudflare dashboard.
