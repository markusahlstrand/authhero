# Cloudflare Workers for Platforms

Deploy authhero as a multi-Worker SaaS platform where each tenant (publisher) gets their own isolated authhero Worker, fronted by a thin dispatcher Worker that routes by custom domain.

## When to use this

The default [Cloudflare Workers deployment](./cloudflare) runs **one** Worker that handles all tenants — tenant resolution happens inside the Worker via the `Host` header. That's the right answer for most deployments.

Reach for Workers for Platforms (WFP) when you need:

- **Per-tenant isolation** — a bug or runaway request in one tenant's worker can't affect others
- **Per-tenant code customization** — publishers can ship modified authhero builds (different login flow, custom hooks, special branding logic) without a shared deploy
- **Per-tenant resource limits** — CPU time and subrequest caps applied per script
- **A true platform model** — you operate authhero as a SaaS where customers deploy "into" you

The trade-off is operational cost: every tenant requires a `wrangler deploy` and shares the same shared D1 (or its own).

## Architecture

```
Internet
   |
   v
[Dispatcher Worker]                     <-- this template (cloudflare-wfp-dispatcher)
   1. Host -> custom_domains -> tenant_id
   2. env.DISPATCHER.get('tenant-<id>-auth').fetch(request)
   |
   v
[authhero-tenants dispatch namespace]
   |- tenant-acme-auth                   <-- full authhero (cloudflare template)
   |- tenant-bob-auth                    <-- full authhero (cloudflare template)
   |- tenant-carol-auth                  <-- ...
```

The dispatcher Worker:
- Resolves the request's `Host` header against the shared platform D1 (`custom_domains` table)
- Synthesizes a default catch-all dispatch route to `tenant-<tenant_id>-auth` if no explicit `proxy_routes` rows exist for that domain
- Forwards the request via `env.DISPATCHER.get(scriptName).fetch(request)`

Tenant Workers are the same single-Worker authhero deployment from the [`cloudflare` template](./cloudflare), just deployed into a dispatch namespace instead of standalone.

## Prerequisites

- Cloudflare account on the **Workers for Platforms** plan (dispatch namespaces require this)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A shared D1 database that the dispatcher and all tenant workers read/write

## One-time platform setup

### 1. Scaffold the dispatcher

```bash
npm create authhero@latest auth-dispatcher -- \
  --template=cloudflare-wfp-dispatcher
cd auth-dispatcher
npm install
```

This produces a thin Worker that uses `@authhero/proxy`'s `dispatch_namespace` handler. Key files:

- `src/index.ts` — Worker entrypoint; wraps `createProxyDataAdapter` with a default dispatch fallback
- `src/types.ts` — `Env` with `AUTH_DB: D1Database` and `DISPATCHER: DispatchNamespace`
- `wrangler.toml` — declares `[[dispatch_namespaces]] binding = "DISPATCHER"` and the D1 binding

### 2. Create the dispatch namespace

```bash
npx wrangler dispatch-namespace create authhero-tenants
```

### 3. Create the shared D1 database

```bash
npx wrangler d1 create authhero-db
# Paste the database_id into wrangler.local.toml
```

### 4. Apply migrations

```bash
npm run db:migrate:remote
```

This applies the migrations bundled with `@authhero/drizzle` — the same schema the tenant Workers use.

### 5. Deploy the dispatcher

```bash
npm run deploy
```

## Onboarding a tenant

For each publisher:

### Step 1 — Provision tenant + custom domain in D1

Either via the authhero management API (recommended) or by inserting rows directly:

```bash
# Via management API (against an admin authhero worker)
curl -X POST https://admin.authhero.example.com/api/v2/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"id": "acme", "name": "Acme Inc"}'

curl -X POST https://admin.authhero.example.com/api/v2/custom-domains \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"tenant_id": "acme", "domain": "auth.acme.com", "type": "auth0_managed_certs"}'
```

### Step 2 — Deploy the tenant's auth worker into the namespace

```bash
# In a directory scaffolded from `create-authhero --template=cloudflare`
wrangler deploy \
  --dispatch-namespace=authhero-tenants \
  --name=tenant-acme-auth
```

The script name **must** match the dispatcher's template — by default `tenant-<tenant_id>-auth`. Override the template globally via the `SCRIPT_NAME_TEMPLATE` env var on the dispatcher (supports `{tenant_id}`, `{custom_domain_id}`, `{domain}`, `{host}` placeholders).

### Step 3 — Point the tenant's custom domain at the dispatcher

In the Cloudflare Dashboard: Workers & Pages → your dispatcher → Triggers → Add Custom Domain → `auth.acme.com`. Or via DNS:

```
auth.acme.com  CNAME  auth-dispatcher.<account>.workers.dev
```

### Step 4 — Verify

```bash
curl https://auth.acme.com/.well-known/openid-configuration
# expect a JWKS issuer document with issuer="https://auth.acme.com/"
```

## Per-tenant routing customization

The dispatcher synthesizes a default catch-all dispatch route when a host has no `proxy_routes` rows. To customize routing for a specific tenant (add CORS, headers, bypass a path), insert `proxy_routes` rows for that `custom_domain_id`. The dispatcher uses your configured routes verbatim instead of the default.

Example: bypass `/healthz` and add CORS to everything else:

```sql
INSERT INTO proxy_routes (id, tenant_id, custom_domain_id, priority, match, handlers, ...)
VALUES (
  'route-acme-healthz', 'acme', 'cd-acme', 100,
  '{"path": "/healthz"}',
  '[{"type": "static", "options": {"status": 200, "body": "ok"}}]',
  ...
);
INSERT INTO proxy_routes (id, tenant_id, custom_domain_id, priority, match, handlers, ...)
VALUES (
  'route-acme-default', 'acme', 'cd-acme', 1000,
  '{"path": "/*"}',
  '[
    {"type": "cors", "options": {"origins": ["https://app.acme.com"]}},
    {"type": "dispatch_namespace", "options": {"binding": "DISPATCHER", "script_name": "tenant-acme-auth"}}
  ]',
  ...
);
```

See the [proxy package handlers](/customization/proxy/) for the full list of route handlers.

## Trade-offs vs. single Worker

| | Single Worker | WFP per-tenant |
| --- | --- | --- |
| Operational complexity | Low | High (deploy per tenant) |
| Isolation between tenants | Soft (logical) | Hard (separate isolates) |
| Per-tenant code customization | Not supported | Native |
| Per-tenant resource limits | Not supported | Per-script |
| Cold-start cost | One worker | One per tenant (mitigated by namespace placement) |
| Cost | Workers Free / Paid plan | Workers for Platforms plan |
| Number of tenants supported | 10,000s (single Worker handles all) | Limited by namespace script count |

## Limitations

- **Local dev cannot emulate the namespace.** `wrangler dev` against the dispatcher runs locally, but dispatch namespace invocation requires a real Cloudflare account. Use `npm run dev:remote` to test end-to-end against a real namespace.
- **D1 binding propagation.** Each tenant Worker also needs the D1 binding to be declared. Codify this in your tenant deploy pipeline (CI / `wrangler.toml` template) — tenants share the platform D1.
- **Secrets distribution.** `ENCRYPTION_KEY` and other secrets need to be set per-script via `wrangler secret put --name=tenant-<id>-auth ENCRYPTION_KEY`. Automate with your deploy tooling.

## Next Steps

- [Single-Worker Cloudflare deployment](./cloudflare)
- [Proxy package handler reference](/customization/proxy/)
- [Custom domain setup](/deployment/custom-domain-setup)
