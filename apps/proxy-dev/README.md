# AuthHero Proxy

A Cloudflare Worker that proxies incoming requests to upstream services based on the request's `Host` header. Built on [@authhero/proxy](https://www.npmjs.com/package/@authhero/proxy).

## Configure your routes

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

## Caching

Resolved hosts are cached in-memory per Worker isolate with a stale-while-revalidate strategy:

- **Fresh** for 5 minutes — served directly from cache.
- **Stale** for the next hour — served from cache while a background refresh runs.
- **Negative** (host not found) — cached for 30 seconds so newly-added hosts come online quickly.

For the static adapter the "refresh" is just a re-read of the in-memory config, so the SWR window mainly matters when you swap to an HTTP- or database-backed adapter.

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
