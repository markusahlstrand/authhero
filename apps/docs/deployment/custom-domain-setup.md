---
title: Custom Domain Setup
description: Configure custom domains for branded AuthHero authentication pages — host resolution, the Cloudflare custom-domains adapter, the edge proxy worker, and KV-published host config.
---

# Custom Domain Setup

This guide explains how to serve AuthHero on a custom domain — both the operator's own
auth domain and per-tenant, customer-owned domains for white-label products.

## Two kinds of "custom domain"

It helps to separate two concerns that often get lumped together:

1. **The operator's auth domain** — your single, branded auth host (e.g.
   `auth.example.com`). Tenants are addressed as subdomains of it
   (`acme.auth.example.com`) or via the `tenant-id` header. This needs nothing
   more than DNS + TLS for one hostname.
2. **Per-tenant, customer-owned domains** — each customer points their own
   hostname (`login.acme.com`) at your platform and sees only their brand. This
   is the white-label case, and it's where the custom-domain **adapter** and the
   **edge proxy** come in.

Most of this page is about case 2.

## How a host resolves to a tenant

At request time, [`tenantMiddleware`](https://github.com/markusahlstrand/authhero/blob/main/packages/authhero/src/middlewares/tenant.ts)
maps the incoming host to a tenant in this order:

1. Authenticated user's tenant
2. `tenant-id` header (API calls — legacy compatibility)
3. Tenant subdomain of the issuer apex — `{tenant_id}.{issuerHost}`, zero lookups
4. **Custom domain lookup** — `customDomains.getByDomain(host)` for any host
   outside the issuer apex
5. `tenant_id` query param (enrollment ticket URLs)
6. Single-tenant auto-detect

Step 4 is the one custom domains rely on. The middleware reads
`x-forwarded-host` before `host`, so a proxy in front of AuthHero must forward
the original browser host as `x-forwarded-host` for resolution to work.

For a custom domain to resolve, two things have to be true:

- A `custom_domains` row exists mapping the hostname → tenant (managed via the
  Management API / Admin UI, see [Domains entity](/entities/configuration/domains)).
- TLS is provisioned for that hostname at the edge, and traffic is routed to
  AuthHero with the host forwarded.

The rest of this page covers provisioning TLS and routing.

## Provider adapters

TLS + edge-hostname provisioning is done through a **custom-domain adapter**.
Today AuthHero ships a Cloudflare adapter; the adapter contract is
provider-agnostic, so other providers (e.g. Bunny) can be added behind the same
interface without touching core.

The adapter implements the `CustomDomainsAdapter` contract from
`@authhero/adapter-interfaces` — `create`, `get`, `getByDomain`, `list`,
`remove`, `update`, and an optional `uploadCertificate` for bring-your-own-cert.
Core only ever calls these methods; whether they talk to Cloudflare, Bunny, or a
plain database is an implementation detail.

### Cloudflare adapter (current)

`@authhero/cloudflare-adapter` provisions [Cloudflare Custom Hostnames](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/)
— certificate issuance and SNI routing — and stores the domain ↔ tenant mapping
in your database adapter.

```typescript
import createAdapters from "@authhero/cloudflare-adapter";
import { createKyselyAdapter } from "@authhero/kysely-adapter";

const database = createKyselyAdapter(db);

const cloudflareAdapters = createAdapters({
  zoneId: process.env.CLOUDFLARE_ZONE_ID!,
  authKey: process.env.CLOUDFLARE_AUTH_KEY!,
  authEmail: process.env.CLOUDFLARE_AUTH_EMAIL!,
  customDomainAdapter: database.customDomains, // DB-backed mapping store
});

// Wire the Cloudflare-backed custom domains into your data adapter.
export const dataAdapter = {
  ...database,
  customDomains: cloudflareAdapters.customDomains,
};
```

Full method reference, BYOC certificate upload, and env vars are in the
[Custom Domains Adapter](/customization/cloudflare-adapter/custom-domains) doc.

::: warning Workers for Platforms: wire this on the control plane, not the tenant
The snippet above assumes one instance holding the Cloudflare account
credentials. On WFP, tenant Workers have neither those credentials nor a view of
other tenants' domains, so they cannot register a hostname or tell whether it is
already claimed. Wire the Cloudflare adapter into the **control plane** (as
`proxyControlPlane.customDomains`) and give tenant Workers
`createControlPlaneCustomDomainsAdapter`, which writes through it and mirrors the
result locally. A tenant that writes straight to its own database produces a row
Cloudflare never sees — the domain will not route. See [Custom domains: the
control plane is
authoritative](/customization/multi-tenancy/control-plane#custom-domains-the-control-plane-is-authoritative).
:::

### Other providers (e.g. Bunny)

Not yet shipped. Anything that can (a) provision a certificate for a hostname and
(b) route that hostname to your AuthHero origin can be wrapped in a
`CustomDomainsAdapter`. The mapping store (the `custom_domains` table) is reused
as-is; only the provisioning calls differ. If you implement one, the same
[Built-in Adapters](/customization/built-in-adapters) injection pattern applies.

## Routing topologies

How custom-domain traffic actually reaches AuthHero depends on your deployment.

### Topology A — Cloudflare custom hostnames straight to one Worker

The simplest white-label setup: AuthHero runs as a single Worker, and Cloudflare
Custom Hostnames terminate TLS for each customer domain and route to that Worker.
The customer adds a CNAME to your stable fallback hostname; the Cloudflare
adapter provisions the cert; `tenantMiddleware` resolves the host. No proxy
needed.

Use this when every custom domain serves **only** AuthHero.

### Topology B — Separate edge proxy worker (multiple surfaces per domain)

When a customer domain needs to front more than just AuthHero — e.g.
`acme.com/u/*` is AuthHero, `acme.com/account/*` is an account app, and
`acme.com/checkout/*` is checkout — put the [`@authhero/proxy`](/customization/proxy/)
package in a **separate Worker** in front. The customer registers the domain
once; the proxy fans path prefixes out to the right upstreams, all sharing one
origin (so session cookies are shared).

This is also the [Workers for Platforms](/deployment/cloudflare-wfp) dispatcher
shape, where the proxy dispatches each host into its per-tenant Worker.

The proxy resolves `Host` → tenant via the same `custom_domains` table, then
runs a per-route handler chain. A minimal shared-DB proxy Worker:

```typescript
import { createProxyApp } from "@authhero/proxy";
import { createProxyDataAdapter } from "@authhero/kysely-adapter";

export default {
  fetch(req, env, ctx) {
    const data = createProxyDataAdapter(makeDb(env.DATABASE_URL));
    return createProxyApp({
      data,
      cache: { freshTtlMs: 5 * 60_000, staleTtlMs: 60 * 60_000 },
    }).fetch(req, env, ctx);
  },
};
```

See [Proxy → Deployment topologies](/customization/proxy/deployment) for
the all-in-one, shared-DB, and separate-DB variants in full.

## Pushing host config to the edge with KV

When the proxy can't share a database with AuthHero — a different Cloudflare
account, VPC, or region — it has to learn routing some other way. The
recommended approach is to **publish each resolved host blob to a Cloudflare KV
namespace** and have the proxy read it with a single, unauthenticated,
edge-local `KV.get`. The control-plane database stays the source of truth; KV is
a published read replica.

```text
custom_domain / proxy_route write
        │
        ▼
wrapProxyAdaptersWithKvPublish ──recompute ResolvedHost──▶ KV.put(host)
                                                              │
proxy:  KV.get(host) ──hit──▶ serve   ── miss/error ──▶ HTTP control plane (fallback)
```

Three steps:

1. **Publish** — wrap the control-plane `customDomains` + `proxyRoutes` adapters
   with `wrapProxyAdaptersWithKvPublish` (from `authhero`). On any write it
   recomputes the whole `ResolvedHost` and publishes it to KV via
   `ctx.waitUntil`, so a slow `KV.put` never adds latency to the write.
2. **Seed** — backfill existing hosts once with `backfillProxyHostsToKv`, and
   schedule it on an hourly [Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
   as a reconcile job.
3. **Use** — on the proxy, read with `createKvProxyAdapter`, keeping the HTTP
   control-plane adapter as the miss/error fallback during migration.

The full publish → seed → use code, the cache layering, and the constraints
(the KV namespace **must live in the same Cloudflare account as the proxy
Worker**; ~60s global propagation) are documented in
[Proxy → Shape 3b](/customization/proxy/deployment#shape-3b-split-db-kv-published-read-replica-recommended-over-plain-shape-3).

## DNS configuration

1. Choose a **stable CNAME target** for customers to point at — e.g.
   `*.custom.example.com`. It should not change as you redeploy, mirroring the
   `*.vercel-dns.com` convention.
2. The customer adds a CNAME from their domain (`login.acme.com`) to that target.
3. Register the domain via the Management API / Admin UI so a `custom_domains`
   row is created (and, with the Cloudflare adapter, a custom hostname is
   provisioned).
4. Cloudflare issues the certificate once it can validate the hostname (HTTP or
   TXT validation, depending on plan).

For apex domains that can't CNAME, use the customer's DNS provider's
CNAME-flattening / ALIAS record, or Cloudflare's apex-proxying options.

## Bring your own certificate (BYOC)

If a customer must supply their own certificate instead of Cloudflare-issued
TLS, the Cloudflare adapter exposes `uploadCertificate`, surfaced as
`PUT /api/v2/custom-domains/{id}/certificate`. The PEM cert + key are installed
at the edge and never persisted by AuthHero. See
[Custom Domains Adapter → BYOC](/customization/cloudflare-adapter/custom-domains#bring-your-own-certificate-byoc).

## Troubleshooting

| Symptom                                                           | Likely cause                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom domain returns the wrong tenant / 404                      | No `custom_domains` row for the host, or the proxy isn't forwarding `x-forwarded-host`. The proxy router resolves from `host` first, then `x-forwarded-host`; AuthHero's `tenantMiddleware` checks `x-forwarded-host` first, then `host`. |
| TLS errors / cert not issued                                      | Cloudflare custom hostname validation hasn't completed — check the CNAME points at your stable target and the hostname status in the Cloudflare dashboard.                                                                                |
| `iss` claim has the wrong host                                    | Self-referencing URLs use the host the client called. Confirm the request reaches AuthHero with the expected host and that `env.ISSUER` is byte-exact (no trailing-slash normalization).                                                  |
| Newly registered domain not routing (split-DB / KV)               | KV propagates globally within ~60s, and a not-yet-seeded host falls through to the HTTP control plane. Run the backfill/reconcile job.                                                                                                    |
| Cookies set on the upstream's domain instead of the custom domain | Add the proxy's `rewrite_cookies` handler (and `rewrite_location` for redirects).                                                                                                                                                         |

## Related documentation

- [Proxy Package](/customization/proxy/) — route matching, handler chain, KV publishing
- [Custom Domains Adapter](/customization/cloudflare-adapter/custom-domains) — Cloudflare API, BYOC
- [Cloudflare Workers for Platforms](/deployment/cloudflare-wfp) — the proxy as a per-tenant dispatcher
- [Domains entity](/entities/configuration/domains) — registering a custom domain
- [Multi-Tenancy architecture](/architecture/multi-tenancy) — how hosts resolve to tenants
