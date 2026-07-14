---
"authhero": minor
"create-authhero": minor
---

Make the control plane authoritative for custom domains.

A custom domain created on a WFP tenant persisted a row to the tenant's own D1 but was never registered in Cloudflare: the tenant shard has no account-level credentials (`zoneId`/`authKey`/`authEmail`), and the control-plane sync path only replicated the row DB→DB. The result was an unroutable, half-provisioned domain.

A CF-for-SaaS custom hostname is an account-global resource in one shared zone, so only something above the shards can register it — or see that another tenant already claimed `login.acme.com`. The control plane now owns the row and the tenant's database holds a read-cache mirror.

- `createControlPlaneCustomDomainsAdapter` — a `CustomDomainsAdapter` for tenant shards that writes through the control plane synchronously and mirrors the result locally. On a conflict it writes nothing, so no orphan row is left behind. `get`/`list` trust the mirror once a domain is `ready` and refresh from upstream while it is `pending`; `getByDomain` always reads the mirror (it is on the tenant-resolution path).
- `createControlPlaneClient` — shared authed transport with a per-(tenant, scope) token cache, single-flight minting, and a single re-mint on 401.
- `proxyControlPlane.customDomains` — mounts the authoritative `/api/v2/proxy/control-plane/custom-domains` resource: cross-tenant uniqueness check (409, nothing written), Cloudflare registration where the credentials live, and get/list/update/remove. Requires the new `controlplane:custom_domains` scope.
- The `cloudflare-wfp-tenant` template wires the control-plane adapter when `CONTROL_PLANE_URL` is set; the `cloudflare-control-plane` template mounts the resource with the Cloudflare adapter when the CF credentials are set.

**Breaking:** `custom_domain` is no longer a control-plane sync entity — only `proxy_route` replicates upward. `createApplySyncEvents` now takes `{ proxyRoutes }` (previously `{ customDomains, proxyRoutes }`), and `custom_domain` `SyncEvent`s are rejected as an unknown entity. Deploy the control-plane resource before pointing tenant shards at it.

Also fixes an auth mismatch on the existing sync path: `POST /sync` required the `proxy:resolve_host` scope while `ControlPlaneSyncDestination` mints its token with `controlplane:sync`, so the POST would have been rejected with a 401. The receiver now accepts either.
