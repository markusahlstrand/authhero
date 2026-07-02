# AuthHero — WFP Tenant Worker

The full `authhero` app for **one tenant**, deployed into a Workers-for-Platforms
dispatch namespace. It reads only its **own D1** and inherits the control
plane's defaults (shared social logins, prompts, branding, system resource
servers, inheritable hooks) from rows the **control plane rollout** projects
into that database.

This is one of three pieces:

| Piece | Template |
| --- | --- |
| Front door (host → tenant → dispatch) | `cloudflare-wfp-dispatcher` |
| **This tenant Worker** | `cloudflare-wfp-tenant` |
| Control plane (rollout source + management) | `cloudflare-control-plane` |

## How defaults work

`src/index.ts` layers the data adapter:

```
D1 → keyed encryption (tenant key + "cp" key) → withRuntimeFallback(control_plane)
```

`withRuntimeFallback` resolves the control-plane rows that the rollout wrote into
this database under the `control_plane` tenant id — the same read path a
control-plane-colocated tenant uses. **No request-time call to the control
plane.**

## Secrets

Two keys, both Worker secrets (never in the database):

- `ENCRYPTION_KEY` — this tenant's own secrets.
- `CONTROL_PLANE_ENCRYPTION_KEY` — the shared `cp` key. Decrypts the inherited
  secrets (e.g. Google `client_secret`). It must be **byte-identical** to the
  control plane's key, or the inherited secrets won't decrypt. A raw export of
  `AUTH_DB` keeps those secrets opaque without it.

## Setup

```bash
npm install
npm run setup            # creates wrangler.local.toml + .dev.vars (ENCRYPTION_KEY generated)
# paste CONTROL_PLANE_ENCRYPTION_KEY (from the control plane) into .dev.vars
npm run migrate          # apply schema to this tenant's D1
npm run dev
```

## Deploy into the namespace

```bash
# one Worker per tenant
wrangler deploy --dispatch-namespace=authhero-tenants --name=tenant-<id>-auth
wrangler secret put ENCRYPTION_KEY                --name tenant-<id>-auth
wrangler secret put CONTROL_PLANE_ENCRYPTION_KEY  --name tenant-<id>-auth
```

After the Worker and its D1 exist, run the control plane's
`sync-defaults` for this tenant so its inherited rows are populated. See the
[Control Plane Defaults](https://docs.authhero.net/customization/multi-tenancy/control-plane-defaults)
docs for the full flow.
