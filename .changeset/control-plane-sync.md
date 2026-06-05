---
"@authhero/adapter-interfaces": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
"authhero": minor
---

Outbox-driven replication of `custom_domains` and `proxy_routes` mutations to a global proxy control plane.

- New `ControlPlaneSyncDestination` and `controlPlaneSync` config block on `AuthHeroConfig`. When configured, every successful create/update/delete on the tenant shard enqueues a `controlplane.sync.*` outbox event that POSTs to `${baseUrl}/api/v2/proxy/control-plane/sync` on the control-plane instance. No-op for single-DB deployments.
- New `POST /api/v2/proxy/control-plane/sync` endpoint mounted when `proxyControlPlane.applySyncEvents` is provided. New `createApplySyncEvents({ customDomains, proxyRoutes })` factory wires an idempotent adapter-backed receiver — handles duplicate creates, out-of-order updates, and deletes of already-removed rows.
- `proxyRouteInsertSchema` gains an optional `id` field so the receiver can preserve the source-shard id; the `@authhero/kysely-adapter` and `@authhero/drizzle` `proxyRoutes.create` adapters now use `input.id` when supplied (falling back to `nanoid()`).
- `LogsDestination` and `LogStreamDestination` filters extended to exclude `controlplane.sync.*` events so replication tasks don't pollute audit logs.
