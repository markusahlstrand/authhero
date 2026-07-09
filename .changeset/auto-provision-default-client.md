---
"authhero": minor
"@authhero/multi-tenancy": minor
---

Auto-provision a default/anchor client at tenant creation (issue #1007).

New tenants now come with a designated interactive default client by construction, so tenant-level flows that need an anchor (e.g. the DCR `/connect/start` consent flow) no longer silently fall back to an arbitrary — possibly M2M — client.

- New shared `provisionDefaultClients()` helper (exported from `authhero`) creates an interactive first-party "Default App", sets `tenant.default_client_id` to it, and provisions an M2M "API Explorer" client authorized against the Management API. It is idempotent and import-safe: it respects an already-set `default_client_id`, reuses an existing interactive client instead of duplicating, and skips the M2M client when one already exists. The Default App is created with no connections, so all of the tenant's connections are offered at login.
- Wired into both tenant-creation paths: the `seed`/bootstrap script and the multi-tenancy `afterCreate` provisioning hook (pooled tenants; isolated tenants are seeded via their own database provisioning).
- `/connect/start` now falls back to the first *interactive* client (via the new `isInteractiveClient` helper) instead of `clients[0]`, so it never anchors on an M2M client.
- `PATCH /tenants/settings` now rejects a `default_client_id` that doesn't reference an existing, interactive client (both the management-api and multi-tenancy handlers).
- Provisioning now recovers from a partial prior run: if the M2M "API Explorer" client exists but its Management API grant is missing (e.g. a run that failed between creating the client and its grant), a re-run restores the grant instead of returning early.
