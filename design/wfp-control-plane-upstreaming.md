# Upstreaming the WFP control-plane → tenant sync into authhero

**Status:** in progress (steps 0–2 landed; step 3 is the `sesamy/auth` swap) · **Updated:** 2026-06-18 · **Owner:** auth team

> Engineering design record, not user docs. The user-facing half lives in
> [apps/docs/customization/multi-tenancy/control-plane-defaults.md](../apps/docs/customization/multi-tenancy/control-plane-defaults.md).

## Why

The Workers-for-Platforms (WFP) control-plane → tenant synchronization machinery
is implemented in the deploy repo (`sesamy/auth`), but almost none of it is
Sesamy-specific. It's a generic capability: "a control-plane tenant projects its
shared state (defaults + public signing keys) into per-tenant databases that
live in separate workers." The receive side already lives in
`@authhero/multi-tenancy` (`projectControlPlaneDefaults`, `withRuntimeFallback`,
`ControlPlaneRolloutAdapter`); the **push side, the wire contract, the
signing-key projection, the Cloudflare transport, and the tenant-worker
scaffold** were prototyped there and should move upstream.

## Design principle: contract vs. transport

Split the machinery along one line:

- **`@authhero/multi-tenancy`** owns the **contract**: what the control plane
  shares, the wire payload shape, how to build it from a control-plane adapter,
  how to apply it to a tenant adapter, and the **security invariants** (signing
  keys are public-only). Transport-agnostic — no Cloudflare, no HTTP, no
  bindings.
- **`@authhero/cloudflare-adapter`** owns the **Cloudflare transport**: pushing
  the payload over a dispatch namespace, the forward middleware, the provisioner
  (script upload + secrets + bindings), and the tenant-worker scaffold.
- **`authhero` core** owns the signing-key helpers (`listControlPlaneKeys`,
  `resolveSigningKeys`, `getJwksForVerification`) — now exported for reuse.
- **`sesamy/auth`** keeps only **wiring + config**: secret values, the
  control-plane tenant id (`"sesamy"`), token-service names,
  `SESAMY_INTEGRATION_OFF_TENANTS`, the Parat/entitlement hooks, and the
  `server.ts`/`app.ts` glue.

## Decisions (resolved during review)

1. **One Cloudflare package, not a new `@authhero/wfp`.** The cross-provider
   reuse already lives in `multi-tenancy`'s contract layer, so a dedicated WFP
   package would box Cloudflare-specific code with no second consumer. Keep it
   in `cloudflare-adapter`, but put the heavy tenant-worker scaffold behind a
   **subpath export** (`@authhero/cloudflare-adapter/wfp`) and make
   `authhero` / `@authhero/drizzle` / `@authhero/multi-tenancy` **optional peer
   dependencies**, so the light adapters (cache, custom-domains, logs…) stay
   free of the app-level graph. Revisit a dedicated package only when a real
   second provider grows the same capability.
2. **Pure push.** The tenant Worker makes **zero** request-time calls to the
   control plane — it stays up even if the control plane is down. The boot-time
   `controlPlaneSync` pull seam is **not wired** in the tenant scaffold. The
   only ingress for defaults + keys is the control-plane push hitting
   `/internal/sync-defaults` → `applyControlPlaneDefaultsPayload`. A freshly
   provisioned tenant starts empty, so provisioning fires **one initial push**
   as part of `onProvision` (the tenant is not ready until it lands).
3. **Signing keys are a dedicated apply path, not an entity-loop flag.** Every
   other projected entity is written under the control-plane tenant id; keys are
   written with **no `tenant_id`**, are public-only, and use a different adapter
   shape (`KeysAdapter.create`, no get-by-kid). So the implementation is a
   dedicated `applyControlPlaneSigningKeys`, surfaced uniformly as a
   `signingKeys` outcome on the apply result.
4. **Rotation is a trigger, not a new method.** `ControlPlaneRolloutAdapter`
   already has `syncDefaultsToTenants(ids)`. The gap is the *signal* (the
   control plane gets no event on key rotation); wire a cron or rotation hook to
   the existing fan-out. Deferred to the scalable-fan-out PR.

## Inventory: what lives where, and status

| Responsibility | Generic? | Target | Status |
| --- | --- | --- | --- |
| Read CP defaults + public keys, strip private material | ✅ | `multi-tenancy` `buildControlPlaneDefaultsPayload` | **done** |
| Apply payload: defaults + signing-key upsert | ✅ | `multi-tenancy` `applyControlPlaneDefaultsPayload` | **done** |
| CP public-key selection (`-_exists_:tenant_id`) | ✅ (security) | `authhero` `listControlPlaneKeys` (now exported) | **done** |
| `service` script binding + extra bindings | transport | `cloudflare-adapter` `ScriptBinding` / `extraBindings` | **done** |
| POST payload to tenant worker over `DISPATCHER` | transport | `cloudflare-adapter/wfp` `createDispatchSyncDefaults` | **done** |
| Header-tenant → dispatch to tenant worker | transport | `cloudflare-adapter` `createWfpForwardMiddleware` | **done** |
| Tenant-worker bootstrap (key-ring, app cache, sync route, issuers gate) | ✅ | `cloudflare-adapter/wfp` `createWfpTenantApp` | **done** |
| Secret values, CP tenant id, hooks, server glue | ❌ | stays in `sesamy/auth` | step 3 |

## Migration sequencing

**Step 0 — `service` ScriptBinding (independent). ✅ DONE.**
`ScriptBinding.type` now accepts `"service"` (with `service` / `environment`);
`createCloudflareWfpD1Provisioner` gains `extraBindings`, appended after the
default `AUTH_DB` + `CONTROL_PLANE_BASE_URL`. `uploadNamespacedScript` already
forwards bindings verbatim.

**Step 1 — the contract in `multi-tenancy`. ✅ DONE.**
`buildControlPlaneDefaultsPayload` / `applyControlPlaneDefaultsPayload`,
`ControlPlaneDefaultsPayload`, the dedicated signing-key path, and the
`signingKeys` entity flag. The defaults read/write was refactored into shared
`readControlPlaneDefaults` / `writeControlPlaneDefaults` so apply reuses the
exact upsert/filter semantics as `projectControlPlaneDefaults`. `authhero` now
exports `listControlPlaneKeys` (single source of truth for key selection).

**Step 2 — the Cloudflare transport. ✅ DONE.**
- Main entry: `createWfpForwardMiddleware` (light — only `adapter-interfaces` +
  `hono` types; no app-level deps).
- Subpath `@authhero/cloudflare-adapter/wfp`: `createDispatchSyncDefaults` and
  `createWfpTenantApp`.
- `createWfpTenantApp` is **pure push**: no `controlPlaneSync`; it gates the
  control-plane issuer via `additionalIssuers` and relies on the **projected**
  public keys for signature verification (no runtime JWKS fetch). The
  `@authhero/drizzle` import stays with the host — the data-adapter factory is
  injected via `createDataAdapter`, so `cloudflare-adapter` carries no ORM dep.
- Packaging: `authhero` + `@authhero/multi-tenancy` are **optional peer deps**;
  `./wfp` subpath export; the scaffold is kept out of the main barrel, so the
  light adapters' module graph is unchanged (`wfp.mjs` ≈ 2.3 kB, externalizes
  the app packages).

**Step 3 — `sesamy/auth` call-site swap. TODO.** Bump deps; replace
`src/provisioning/sync-defaults.ts`, `src/middlewares/wfp-forward.ts`, and most
of `tenant-worker/src/index.ts` with the upstreamed helpers. **Not a pure swap:**
removing the boot-time pull seam and wiring the provision-time initial push are
deliberate behavior changes — ship with a tested cutover + bundle redeploy.

## Deferred to a follow-up PR

- **Scalable fan-out.** Step 2 ships single-tenant push (provision seed + manual
  re-sync). Durable, retryable, resumable fan-out across all ready tenants — the
  Cloudflare Workflows implementation of `ControlPlaneRolloutAdapter` — lands
  later.
- **Rotation trigger.** Once durable fan-out exists, a cron/rotation hook
  re-pushes to every tenant via the existing `syncDefaultsToTenants`.

## Signing keys: invariants centralized

1. **Public-only.** `pkcs7` stripped on build AND on apply.
2. **No `tenant_id`.** Stored as shared keys so `listControlPlaneKeys` resolves
   them for verification.
3. **Verify-only by construction.** No private material ⇒ the sign path can't
   use them.
4. **Create-if-missing by `kid`.** Rotation mints a new kid; old public keys are
   harmless to leave behind.

## Open questions (remaining)

- `createWfpTenantApp` env contract (`WfpTenantEnv`) — finalize binding names
  during step 2.
- Fan-out execution strategy (cron in host vs. rollout-adapter method vs.
  Workflows) — decide alongside the broader Workflows rollout.
