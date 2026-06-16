# AuthHero — Control Plane Worker

The **management surface and rollout source** for a Workers-for-Platforms setup.
It manages tenants, serves colocated tenants from the shared database, and
projects the control plane's defaults (shared social logins, prompts, branding,
system resource servers, inheritable hooks) into each WFP tenant's own database.

This is one of three pieces:

| Piece | Template |
| --- | --- |
| Front door (host → tenant → dispatch) | `cloudflare-wfp-dispatcher` |
| Per-tenant Workers | `cloudflare-wfp-tenant` |
| **This control plane** | `cloudflare-control-plane` |

## The rollout

`src/index.ts` builds a `createDirectRolloutAdapter` (inline execution). The app
exposes:

```
POST /internal/tenants/:id/sync-defaults
```

Call it **after a tenant is provisioned** and **after rotating a shared secret**.
It reads the control plane tenant's inheritable rows and upserts them (by id,
idempotently) into the target tenant's database under the `control_plane`
tenant id, re-encrypting secrets under the `cp` key.

::: warning Two things to wire before production
1. **`buildTenantAdapters(env, tenantId)`** in `src/index.ts` is a stub. Return
   the `DataAdapters` over the target tenant's own D1, wrapped with the same key
   ring the tenant Worker uses (`{ default, keys: { cp } }`). How you reach a
   tenant's D1 is platform-specific (per-tenant binding or the D1 HTTP API).
   Until implemented, the endpoint returns `501`.
2. **Protect the `/internal/...` route** (service binding, mTLS, or admin token).
   It re-keys tenant databases.
:::

## Secrets

- `ENCRYPTION_KEY` — the control plane's own secrets at rest.
- `CONTROL_PLANE_ENCRYPTION_KEY` — the shared `cp` key the rollout encrypts
  projected secrets under. Every tenant Worker holds the **same** key to decrypt
  them; keep it byte-identical everywhere.

## Setup

```bash
npm install
npm run setup     # creates wrangler.local.toml + .dev.vars (ENCRYPTION_KEY generated)
# add CONTROL_PLANE_ENCRYPTION_KEY (openssl rand -base64 32) to .dev.vars
npm run migrate
npm run seed      # seed the control plane tenant + admin
npm run dev
```

See [Control Plane Defaults](https://authhero.net/docs/customization/multi-tenancy/control-plane-defaults)
for the full architecture and request flows.
