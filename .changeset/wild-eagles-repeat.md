---
"authhero": minor
"create-authhero": minor
---

Make the control plane authoritative for custom domains.

A custom domain created on a WFP tenant persisted a row to the tenant's own D1 but was never registered in Cloudflare: the tenant shard has no account-level credentials (`zoneId`/`authKey`/`authEmail`), and the control-plane sync path only replicated the row DB→DB. The result was an unroutable, half-provisioned domain.

A CF-for-SaaS custom hostname is an account-global resource in one shared zone, so only something above the shards can register it — or see that another tenant already claimed `login.acme.com`. The control plane now owns the row and the tenant's database holds a read-cache mirror.

- `createControlPlaneCustomDomainsAdapter` — a `CustomDomainsAdapter` for tenant shards that writes through the control plane synchronously and mirrors the result locally. On a conflict it writes nothing, so no orphan row is left behind. `get`/`list` read through to the control plane (which owns the row) and fall back to the mirror when it is unreachable; `getByDomain` always reads the mirror, since it is on the tenant-resolution path. A failed mirror write surfaces as a 503 rather than reporting success for a domain this shard cannot route.
- `createControlPlaneClient` — shared authed transport with a per-(tenant, scope) token cache, single-flight minting, and a single re-mint on 401. Pass `createServiceBindingFetch(env.CONTROL_PLANE)` to keep the call inside Cloudflare instead of looping out over the public edge.
- `proxyControlPlane.customDomains` — mounts the authoritative `/api/v2/proxy/control-plane/custom-domains` resource: cross-tenant uniqueness check (409, nothing written), Cloudflare registration where the credentials live, and get/list/update/remove. Requires the new `controlplane:custom_domains` scope, and every operation is authorized against the token's `tenant_id` claim — every shard holds the scope, so a request-supplied tenant id is refused with 403. `PATCH` accepts only the mutable Auth0 fields, so a caller cannot move the hostname or forge lifecycle state.
- The `cloudflare-wfp-tenant` template wires the control-plane adapter when `CONTROL_PLANE_URL` is set, routing the call over an optional `CONTROL_PLANE` service binding. Without the URL it **refuses custom-domain writes (501)** rather than silently storing an unregistered row. The `cloudflare-control-plane` template mounts the resource with the Cloudflare adapter when the CF credentials are set, and uses that same adapter for its own colocated tenants.

**Breaking:** `custom_domain` is no longer a control-plane sync entity — only `proxy_route` replicates upward. `createApplySyncEvents` now takes `{ proxyRoutes }` (previously `{ customDomains, proxyRoutes }`), and `custom_domain` `SyncEvent`s are rejected as an unknown entity. Deploy the control-plane resource before pointing tenant shards at it.

Also hardens `POST /sync`, which could not previously have authenticated anyone: it required the `proxy:resolve_host` scope while `ControlPlaneSyncDestination` mints its token with `controlplane:sync`, so every sync POST would have 401'd. It now requires `controlplane:sync` — `proxy:resolve_host` is the proxy's read credential and must not be able to rewrite proxy routes — and a shard may only replicate events for its own tenant.
