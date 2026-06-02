# AuthHero WFP Dispatcher

Thin Cloudflare Worker that fronts a Workers-for-Platforms deployment of AuthHero. Resolves an incoming request's `Host` header to a tenant via the shared platform D1 (`custom_domains` table) and dispatches the request to that tenant's full authhero auth server, deployed as a script in a Cloudflare dispatch namespace.

## Architecture

```
Internet
   |
   v
[This worker — the dispatcher]
   1. Host header -> custom_domains -> tenant_id
   2. env.DISPATCHER.get('tenant-<id>-auth').fetch(request)
   |
   v
[authhero-tenants dispatch namespace]
   |- tenant-acme-auth   (full authhero, deployed from the `cloudflare` template)
   |- tenant-bob-auth
   |- ...
```

Tenant workers come from the **`cloudflare` create-authhero template** — they're the same single-tenant auth server, deployed into the namespace instead of standalone.

## Prerequisites

- A Cloudflare account on the **Workers for Platforms** plan (required for dispatch namespaces).
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
- A D1 database (shared with the tenant workers).

## One-time platform setup

```bash
# 1. Create the dispatch namespace
npx wrangler dispatch-namespace create authhero-tenants

# 2. Create the shared D1 (or reuse the one your tenant workers use)
npx wrangler d1 create authhero-db

# 3. Copy wrangler.toml -> wrangler.local.toml and paste the database_id

# 4. Apply migrations to the shared D1
npm run db:migrate:remote
```

## Deploy the dispatcher

```bash
npm install
npm run deploy
```

## Onboard a tenant

For each publisher:

1. **Provision the tenant in D1** — insert a `tenants` row, then a `custom_domains` row mapping their domain to the tenant_id. (Either via the authhero management API or by direct D1 query.)

2. **Deploy their auth worker into the namespace.** From the sibling `cloudflare` template:

   ```bash
   # In the tenant's directory (scaffolded from `create-authhero --template=cloudflare`)
   npx wrangler deploy \
     --dispatch-namespace=authhero-tenants \
     --name=tenant-<tenant_id>-auth
   ```

3. **Point their custom domain at this dispatcher worker** (Cloudflare → Workers → Triggers → Add Custom Domain on this worker, or via DNS to the worker's `*.workers.dev` route).

Once those three steps are done, a request to `auth.<their-domain>/authorize?...` flows to this dispatcher → resolved via custom_domains → dispatched to their tenant worker.

## Per-tenant routing customization

By default, hosts with no `proxy_routes` rows get a single catch-all that dispatches to `tenant-<tenant_id>-auth`. If a tenant needs richer routing — different middleware chains, CORS, a special path that bypasses the namespace — insert `proxy_routes` rows for that `custom_domain_id`. The dispatcher uses the configured routes verbatim instead of the default.

The script-name template (`tenant-{tenant_id}-auth`) can be overridden globally via the `SCRIPT_NAME_TEMPLATE` env var. Supported placeholders: `{tenant_id}`, `{custom_domain_id}`, `{domain}`, `{host}`.

## Local development

```bash
npm run dev
```

`wrangler dev` runs against a **local SQLite-backed D1**. The dispatch namespace cannot be emulated locally — for end-to-end tests, deploy to a real Cloudflare account using `npm run dev:remote`.

## Files

- `src/index.ts` — dispatcher worker entrypoint
- `src/types.ts` — Env interface (D1 binding + DISPATCHER namespace binding)
- `wrangler.toml` — Cloudflare config (assets, D1, dispatch namespace)
