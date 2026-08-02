# AuthHero Console — a Substrat vertical

This is the **kernel-backed control plane** for AuthHero, built on Substrat. It is the
replacement for the `control_plane` magic tenant described in the AuthHero design doc
`docs/design/billing-and-console-on-substrat.md`. This repo implements **Stage 2** of that
plan: a tenant registry + provisioning, and the entitlements seam the auth core reads.

**It is a standalone project**, not part of the `authhero` pnpm workspace. Its own install,
its own deploy (a separate Worker). The join key back to AuthHero is the tenant id: a
console tenant's id **is** the AuthHero (WFP) tenant id.

## What this is (and is not)

- **This vertical = the console / control plane.** It provisions customer tenants, owns the
  plan→entitlement policy, and drives provisioning by event.
- **It is NOT the AuthHero auth core.** The real OAuth/OIDC runtime stays on Cloudflare WFP
  with one D1 per tenant, unchanged. Here it is represented by the tiny `authcore`
  stand-in module (one `probe-feature` operation) purely so the entitlements seam can be
  exercised end to end. Do not grow `authcore` into a real auth server — that lives in the
  `authhero` package.

## The two modules

| Module | Runs in | Owns | entitlementKey |
|---|---|---|---|
| `controlplane` | the platform **console scope** | tenant registry (`controlplane_tenant`), emits `console.tenant-registered` / `console.plan-changed` | `authhero-console` |
| `authcore` (stand-in) | each **customer scope** | one op: read the entitlement set at an enforcement point (§5.4 read-port) | `authhero-auth-core` |

## How provisioning works (the important pattern — platform intents)

Module code may not hold platform authority (`createTenant` / `provisionScope` /
`grantEntitlement` are `HostAdmin`). Since Substrat 0.31.0 the sanctioned seam is
**platform intents** (`ctx.requestPlatform` → platform drain), and the console uses it:

1. `controlplane/register-tenant` writes the console-owned row (ids/metadata/plan; NO status
   column — status is derived, see below), emits the fat event, and **enqueues** a
   `provision-tenant` intent (`src/intents.ts` is the wire contract).
2. The **platform** drains and effects it with HostAdmin authority. Locally that is
   `drainConsole` (`src/platform-handlers.ts`) running control-plane-api's REAL
   `drainScopePlatformRequests` engine against the CP-full sqlite host — the same code path
   the hosted platform runs; the handlers are the liftable reference for Substrat's own.
   Seed drains after seeding; the server drains eagerly after mutating ops.
3. `controlplane/set-plan` likewise enqueues `set-entitlements`; the handler reconciles the
   tenant's grants to the plan's declared-SKU set (grant present, revoke declared-but-absent).
4. **Status is never stored** (provisioning-capability.md §9): `list-tenants` derives it from
   the `_substrat_platform_requests` spine (pending → `provisioning`, failed → `failed`,
   else `active`). Reading spine tables is allowed; writing never. Once Substrat ships the
   §9 managed-tenants projection, existence/status reads move to that projection.
5. Two-phase idempotency: the console PROPOSES tenant/scope ULIDs in the payload (join key);
   they are not facts until the intent settles. Draining twice is a no-op.

The **entitlements read-port is native**: `ctx.entitlement(key)` / `ctx.entitlements()`,
backed by `admin.grantEntitlement`. There is nothing to build for it — the auth core just
reads it at each enforcement point.

## The cast (roles, per the platform tenant)

- `platform-operator` — `console:tenant-provision`, `console:tenant-read`, `console:plan-manage`
- `support-agent` — `console:tenant-read` only (the wrong-role denial)
- `auth-core` — a service principal granted `authcore:feature-check` on each customer scope
- `mallory` — granted nothing (the attacker)

The `x-principal` header (server) is a **dev seam, not a login** — it maps a readable name to
a principal ULID in `src/constants.ts`. It must be replaced with real auth (Better Auth / an
OIDC RP — AuthHero itself, per design §6) before this is exposed. Shipping it is a
cross-tenant hole with a UI.

## Layout

```
src/manifest.ts    PERM consts + both moduleManifest.parse() calls   ← module code
src/migrations.ts  SqlMigration[] (controlplane_tenant, no status)   ← module code
src/module.ts      operations + the two ModuleRegistrations          ← module code
src/policy.ts      plan→entitlement + feature→entitlement maps        ← module code (pure data)
src/intents.ts     intent kinds + payload schemas (wire contract)    ← module code (pure data)
src/constants.ts   harness ULIDs + name→principal map                ← harness
src/platform-handlers.ts  liftable PlatformRequestHandlers + drainConsole  ← harness (platform authority)
src/seed.ts        host, modules, seed world, post-seed drain        ← harness
src/server.ts      thin Hono wrapper, x-principal dev header, eager drain  ← harness
test/scenario.test.ts  happy path + async provisioning + every denial     ← harness
```

## The two workers (M1 hosted shape)

Two independently pushable verticals live here:

- **`src/worker.ts`** — the console (meridian shape): `defineScopeDO([controlplaneModule])`,
  per-request `CloudflareScopeHost`, router-asserted node (`readRoutedNode`), AuthHero-OIDC
  bearer auth (`src/oidc-auth.ts` verifies RS256 vs `{OIDC_ISSUER}.well-known/jwks.json`;
  `src/identity.ts` derives the deterministic principal from `sub`), platform-secret-gated
  `/internal/*` incl. the **intent pull surface** (`/internal/platform-requests` +
  `/settle`), `/op/:module/:op`, and the SPA served from `src/assets.generated.ts`
  (built from `app/` by `scripts/gen-assets.mjs` — no ASSETS binding in the sandbox).
  `x-tenant`/`x-scope`/`x-principal` dev seams exist ONLY behind `ALLOW_DEV_HEADER`.
- **`authcore/`** — the auth-core STAND-IN as its own vertical: `/internal`-only surface
  (provision with **projected entitlements** #310, a platform-gated `/internal/probe`
  diagnostic, introspection). No public ops, no auth stack. Replaced wholesale by the real
  auth core (design stage 1).

Local smoke (verified): `npx wrangler dev --local --var ALLOW_DEV_HEADER:true --var
PLATFORM_SECRET:devsecret` → provision console scope via `/internal/provision` (owner gets
`platform-operator` via tuple projection) → register-tenant → intent visible on
`/internal/platform-requests`. Auth-core: provision with entitlements → `/internal/probe`
reads mfa=true/pro, saml=false. `assertPlatformCall` fails closed with NO secret configured
(by design — set `PLATFORM_SECRET` even in dev).

boundary-lint harness exemptions live in `boundary-lint.config.json` (oidc-auth.ts fetches
JWKS; platform-handlers.ts wields HostAdmin — both harness, never module code).

## Commands

```sh
pnpm install
pnpm verify                     # typecheck + typecheck:worker + tests + boundary-lint
pnpm test                       # scenario incl. denials + async provisioning (15 tests)
PORT=8899 pnpm server           # node harness; curl with -H 'x-principal: operator|support|mallory|auth-core'
npm --prefix app run build && pnpm gen:assets && pnpm build:worker   # worker bundle
```

## The full local stack (verified runbook)

Four processes; `scripts/local-platform.ts` plays Substrat's platform over the real wire:

```sh
# 1. AuthHero issuer — the docker image seeded like today (admin/admin, client 'default').
#    The seeded client needs the console origin added (callbacks/web_origins/allowed_origins
#    += http://localhost:8788) — patch via docker exec better-sqlite3; ALLOWED_ORIGINS env
#    on the container must include http://localhost:8788 for token-endpoint CORS.
docker run -d --name authhero-console-issuer -p 3000:3000 -v authhero-console-issuer-data:/data \
  -e PORT=3000 -e ISSUER=http://localhost:3000/ -e DATABASE_PATH=/data/db.sqlite \
  -e SEED=true -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=admin \
  -e ALLOWED_ORIGINS="http://localhost:8788,http://localhost:5174" authhero-authhero:latest

# 2. Console worker (:8788) — DEV_TENANT/DEV_SCOPE are the no-router dev default node
npx wrangler dev --local --port 8788 --var ALLOW_DEV_HEADER:true --var PLATFORM_SECRET:devsecret \
  --var OIDC_ISSUER:http://localhost:3000/ --var OIDC_CLIENT_ID:default \
  --var DEV_TENANT:0AHC0NS00ETENANT0000000000 --var DEV_SCOPE:0AHC0NS00ESC0PE00000000000

# 3. Auth-core stand-in (:8789)
cd authcore && npx wrangler dev --local --port 8789 --var PLATFORM_SECRET:devsecret

# 4. Bootstrap (owner = the admin's sub → derived principal), then the drain loop
pnpm platform:local bootstrap "<admin user_id from the seeded DB>"
pnpm platform:local            # drains provision-tenant / set-entitlements every 2s
```

Then open http://localhost:8788 → Sign in with AuthHero (admin/admin) → register a tenant →
watch provisioning → active as the driver drains → the instance materializes on :8789 with
projected entitlements (probe via /internal/probe). Password grant is NOT supported by the
image — real login is the browser PKCE flow; headless tests use client_credentials (JWKS
verify path) + the dev header.

## The rules (non-negotiable — module code only; seed.ts/server.ts are harness)

1. **Data access is `ctx.sql` only.** No `better-sqlite3`, no adapter, no `node:*` in module code.
2. **No `fetch`/network in module code.** Reach the outside world with a connector; reach
   platform authority (provisioning) with an **executor** fired by a fat event.
3. **Never write `_substrat_*` tables.** Reads are fine.
4. **Another module's tables are private.** Never `SELECT` from another module's `*_` tables —
   use its exported in-scope functions; keep your own side table keyed by its id if you need more.
5. **Every operation checks a permission first** — `assertAllowed(await ctx.check(PERM))`.
6. **Every mutation emits a fat event** — a consumer/executor must never need a cross-module read.
7. **Never fork an engine.** Compose.
8. **IDs are `ulid()`. Money is strings** via `@substrat-run/contracts` helpers.
9. **Web-standard APIs always** (`globalThis.crypto`, `TextEncoder`, `URL`).
10. **Parse, don't trust.** Zod at every boundary, with `z` imported **from
    `@substrat-run/contracts`**, never from `zod` (schemas don't compose across copies/majors).

### Kernel gotchas learned building this (save the next session the debugging)

- Permission keys match `/^[a-z0-9-]+:[a-z0-9-]+$/` — **one colon, no dots** (`console:tenant-read`).
- Entitlement keys match `/^[a-z0-9-]+$/` — **no dots** (`authhero-auth-core`).
- All ids (tenant/scope/principal/platformActor) are **ULIDs** — you can't use readable strings.
- `provisionScope` writes status `provisioning`; **you must call `activateScope`** after it or
  `getScope` fails closed.
- `piiClass: 'pseudonymous'` **requires** a `subjectId`. Tenant slug/name is org data → use `'none'`.

## Not built yet (later stages of the design doc)

- Stage 3: tenant members/invites (`@substrat-run/engine-invites`), custom domains, proxy routes.
- Stage 4: billing state machine + **Stripe connector** (follow `@substrat-run/connector-scrive`:
  idempotency ledger in connector state + a reconciliation alarm; verify webhook sigs with Web Crypto).
- Stage 5: console UI + custom hostnames (`substrat hostnames bind`).
- The real `entitlements` read-port inside the `authhero` package (the one additive auth-core change).
