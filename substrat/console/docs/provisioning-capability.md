# Substrat capability request: the "manager vertical" (tenant provisioning from a vertical)

- **Status:** Mechanism SHIPPED in 0.31.0; one tenant-level intent still to design (this doc, §8)
- **Raised by:** AuthHero console (this vertical), 2026-07-30
- **Amends:** `authhero/docs/design/billing-and-console-on-substrat.md` §11.1 (open decision:
  "how much AuthHero's CP leans on the platform CP vs. carries its own")
- **Substrat refs:** `platform-intents.md`, `multi-scope-manyfold.md`, `control-plane-api`
  (`ControlPlaneClient`, `drainScopePlatformRequests`, `provisionSiblingHandler`),
  `ctx.requestPlatform` (kernel 0.31.0), `ProvisionInstanceInput.entitlements` (#310/#304/#302)

## 0. What 0.31.0 delivered (against this doc's §2/§7)

- **§2.1 event-effected seam — SHIPPED.** `ctx.requestPlatform({kind, payload})` enqueues a
  typed intent in the scope DO (atomic with the op, no upward call, backpressured at
  `MAX_PENDING_PLATFORM_REQUESTS`). The platform pulls (`VerticalClient.listPlatformRequests`),
  runs `drainScopePlatformRequests(client, ctx, handlers)` with `HostAdmin`, settles back
  (two-phase idempotent via the intent's `result`). Built-in kinds: `provision-sibling`
  (same tenant, same vertical — multi-scope) and `archive-scope`.
- **§2.2 sanctioned client — SHIPPED.** `ControlPlaneClient.createTenant` / `grantEntitlement`
  / `provisionScope` / `activateScope` (HTTP-over-HostAdmin).
- **§7 Q4 — ANSWERED YES.** `ProvisionInstanceInput.entitlements` (#310): the platform delivers
  the tenant's entitlements *with* provisioning; a CP-less vertical PROJECTS them into the new
  scope and reads/enforces them via `ctx.entitlement` (#304) — the `CONTROL_PLANE` binding stays
  forbidden (#302). The entitlements seam works exactly as this vertical assumes.

**What's left:** the built-in intents are same-tenant. A console creates *new customer tenants*
running a *different* vertical, with entitlements. That tenant-level intent is §8.

**Console status (2026-08-01):** the vertical now runs the intent flow end-to-end locally. The
module enqueues `provision-tenant` / `set-entitlements` via `ctx.requestPlatform`
(`src/intents.ts` is the wire contract, §8.1's shape verbatim); the harness drains through the
REAL `drainScopePlatformRequests` engine with handlers in the `PlatformRequestHandler`
signature (`src/platform-handlers.ts` — the liftable reference for the platform's own
handlers). Status is derived (pending intent → `provisioning`, failed → `failed`), never
stored — the §9 split, minus the projection that isn't shipped yet. What the platform side
still needs from Substrat: register handlers for these two kinds enforcing §8.2's invariants,
plus §9's projector.

## 1. The gap

A **console is a vertical whose job is to add tenants**. Every multi-tenant SaaS on the
platform needs one (self-service signup, "add a customer" in an admin UI).

Today the platform cannot host that. A WFP-dispatched vertical is **CP-less** — from
adapter-cloudflare's own contract:

> a CP-less vertical … treats entitlements as enforced upstream at provision. **Its admin
> surface (createTenant, defineRole, tenant grants, …) is unavailable**; such a vertical
> provisions via `provisionScopeLocal` and is served via `getScope`/`invoke`.

So the only thing that can `createTenant`/`grantEntitlement` is a **first-party app with the
`controlPlane` DO binding**. The platform therefore supports *"apps the platform provisions
scopes for"* but not *"an app that provisions tenants for itself"* — the console category is
missing.

Handing a dispatch vertical the `controlPlane` binding is **not** the fix: that is unbounded
cross-tenant authority inside the sandbox. The fix is a **narrow, audited, capability-scoped**
provisioning right.

## 2. The capability: a "manager vertical"

A vertical may be authorized, at install, to **provision and manage tenants of a target
vertical** (possibly itself). It never gains raw HostAdmin; it gains a bounded right the
platform effects and audits on its behalf.

### 2.1 Preferred mechanism — event-effected (matches the star topology)

The manager vertical **emits a fat event**; a **platform-side provisioning executor** effects
it with real authority, audits it, and pull-calls the target vertical's `/internal/provision`.

```
console scope (CP-less vertical)                     platform control plane
  op: register-tenant
    ctx.sql insert registry row
    ctx.emit console.tenant-registered  ───────────▶  provisioning executor (HostAdmin)
      { tenantId, authScopeId, slug,                    admin.createTenant(...)
        name, plan, entitlements,                       host.provisionScope(... vertical: authhero-auth-core)
        targetVertical: authhero-auth-core }            admin.activateScope(...)
                                                        admin.grantEntitlement(... only declared SKUs)
                                                        POST authhero-auth-core:/internal/provision
                                                        (audited, causedBy = the event id)
```

This is exactly the executor pattern already in this repo's `src/seed.ts` — **the local
CP-full `SqliteScopeHost` executor is the dev stand-in for this platform executor.** The
console's module code does not change: it already only `ctx.sql` + `emit`s.

### 2.2 Alternative — capability binding (RPC)

An admissible, narrow `env.PROVISION` binding exposing only:
`createTenant`, `provisionScope`, `grantEntitlement`, `revokeEntitlement`. This is design §3's
"sanctioned client over an injectable service-binding fetch," made a first-class **narrow**
binding rather than the full `controlPlane` DO. Synchronous; otherwise identical guarantees.

Either mechanism satisfies the console. §2.1 is preferred because it needs zero new binding
type and matches the event grain.

## 3. Authorization invariants (what makes it sandbox-admissible)

1. **Workspace-scoped.** A manager vertical can only create/manage tenants within **its own
   workspace**; it can never address a tenant it does not manage. (No cross-tenant read/write
   leaks into the sandbox — the property the CP-less contract protects.)
2. **SKU-scoped grants.** `grantEntitlement` is restricted to the entitlement keys the manager
   vertical **declares it owns** (`manifest.entitlements`). The console may grant `authhero-mfa`
   because it owns that SKU; it can grant nothing else.
3. **Declared managed verticals.** Provisioning a scope of a *different* vertical requires an
   explicit manifest declaration (proposed `manifest.provisions: ["authhero-auth-core"]`),
   authorized at install. Absent it, a manager can only provision **its own** scopes.
4. **Platform effects + audits everything.** Every createTenant/provisionScope/grant is stamped
   on the platform audit spine (actor = the manager vertical + the acting principal,
   `causedBy` = the emitting event). No unaudited authority ever lives in the vertical.

## 4. Idempotency & failure

- Effecter runs **at-least-once** (as executors already do) → all four calls must be idempotent
  (`createTenant`/`grantEntitlement` already are; `provisionScope` is journaled).
- A failed pull-callback to `/internal/provision` is retried with backoff and dead-lettered —
  the platform's existing executor semantics; the tenant row exists but the scope is
  `provisioning` until the callback succeeds (observable, retryable — matches the K-31 gap the
  design already names).

## 5. What the console consumes (the contract it needs)

- **Emit** `console.tenant-registered` / `console.plan-changed` with a payload carrying
  `{ tenantId, authScopeId, targetVertical, entitlements[] }` (already emitted today, minus
  `targetVertical`).
- **Guarantee** that, for an installed manager vertical, the platform runs an effecter for
  those event types honoring invariants §3.
- **Read back** provisioning state (tenant status, scope status) — already covered by
  `listTenants` in the registry + the platform directory.

The console needs **no `controlPlane` binding and no raw HostAdmin**. It stays sandbox-clean.

## 6. Impact on this vertical

- **Module code:** unchanged (already emits fat events).
- **`src/seed.ts` executor:** stays as the **dev/local** effecter (CP-full `SqliteScopeHost`).
- **Hosted:** the platform effecter replaces it; the console just emits. The `targetVertical`
  field is the only payload addition.

## 7. Open questions for the Substrat side

1. Event-effected (§2.1) vs binding (§2.2) — platform's preference?
2. Manifest surface for "I manage vertical X" — `provisions: string[]`? Authorized how at install?
3. Cross-vertical `/internal/provision` pull: does the effecter call the **target** vertical's
   deployment, resolved via the directory (`deploymentRef`)?
4. Does the platform already project the granted entitlements into the **target scope's**
   local store (so the auth core reads them via `ctx.entitlement` with no CP call, per
   scope-local-permissions.md)? The console assumes yes. **(Answered: yes, #310.)**

## 8. The tenant-level intent (long-term-correct, generic)

`provision-sibling` is same-tenant/same-vertical by design (a tenant grows a scope). A **console**
is the other shape: it onboards a **new customer = a new tenant**, whose first scope runs a
**different** vertical, carrying **entitlements**. This is not AuthHero-specific — it is what every
B2B SaaS console on the platform needs ("add a customer" / self-serve signup). It deserves a
first-class, generic intent, not a per-vertical handler.

### 8.1 The intent

```
kind: "provision-tenant"                       // a new well-known kind, beside provision-sibling
payload: {
  tenant:      { id?, slug, name },            // id optional: vertical MAY propose a ULID (idempotent
                                               //   join key); else platform mints and returns it
  instance:    { vertical, scopeId?, slug, name, owner },   // the tenant's FIRST scope (any vertical)
  entitlements: EntitlementGrantInput-ish[],   // SKUs to grant + project (see 8.2 invariant 3)
  config?:     Record<string,string>,          // delivered to the instance (ProvisionInstanceInput.config)
}
```

Handler = `createTenant` → (the existing `provisionSiblingScope` flow for the first scope, but
with `vertical` from the payload instead of inherited) → `grantEntitlement` per SKU. It **reuses**
`provisionInstance` (so entitlements project into the new scope, #310) and the two-phase idempotency
(mint-once, record ids in `result`, retry converges). Almost entirely a composition of shipped parts;
the new surface is the `kind`, its payload schema, and the authorization in 8.2.

### 8.2 Authorization — the crux (what makes it safe for ANY vertical)

`provision-sibling` is safe because the draining scope *proves the tenant* and the new scope lands
under it. A **new tenant has no parent tenant to bound it**, so the safety has to come from bounding
the **manager**. Four invariants — a `provision-tenant` intent from a vertical holding none of these
settles `failed`, never silently provisions:

1. **Provisioner capability (staff-granted at admission).** Only a vertical explicitly authorized as
   a manager/console may create tenants. Creating tenants is privileged (it is where cost and blast
   radius begin), so unlike an ordinary install this one wants a staff decision, recorded — the same
   bar `setVerticalListed` already clears. A normal vertical's `provision-tenant` is refused.
2. **Tenant ownership is recorded (the key new directory data).** Every tenant born this way records
   its **provisioner** = (manager tenant/workspace, manager vertical). This is what makes the power
   accountable rather than ambient: it gives per-manager **quota/metering** (tenant creation is the
   billable event), an **audit** answer to "who spawned this tenant," and a **revocation/deprovision**
   path (reap every tenant a manager owns). It also *is* AuthHero's model — "the console's tenant id
   IS the AuthHero tenant id," now with the ownership edge made first-class.
3. **Entitlement grants scoped to declared SKUs.** The handler may grant only entitlement keys the
   manager (or the target vertical) **declares it owns** (`manifest.entitlements`). Granting an
   undeclared key is refused — a console cannot mint another vertical's premium features, and cannot
   grant itself revenue-bearing SKUs it does not own.
4. **Target vertical must be declared.** The manager declares which vertical(s) it provisions
   (proposed `manifest.provisions: string[]`), authorized at admission. `instance.vertical` outside
   that set is refused — a console cannot spin up arbitrary verticals.

### 8.3 Metering hook (ties to billing, design §5.2)

Because tenant creation is where cost starts, the handler should check the **manager's own**
entitlement/quota before creating (e.g. "this console's plan allows N customer tenants"). That keeps
the platform's billing story and the manager's billing story on the same primitive, and closes the
"infinite free tenants" hole invariant 2 only *measures*.

### 8.4 Why not just let the console hold `ControlPlaneClient`?

Because that needs egress + a service token, and the sandbox forbids both for a dispatch vertical
(#302). The intent keeps the vertical sandbox-clean: it *asks*, the platform *acts and audits*. The
`ControlPlaneClient` stays a platform-side (or first-party) tool, used by the handler — never handed
into the sandbox.

### 8.5 Open platform-policy questions

1. Vertical-proposed tenant id (idempotent join key, uniqueness checked) vs platform-minted
   (returned in the intent `result`)? The console prefers proposed (it writes its registry row at
   request time), but platform-minted is safe too if `result` carries the id back.
2. Where does the provisioner-capability grant live — a staff flag on the vertical registry
   (beside `listed`), a role/grant on the manager's scope, or a manifest field admitted at push?
3. Is `manifest.provisions: string[]` the right home for "verticals I may provision," or a separate
   install-time relationship?
4. Does tenant-ownership (invariant 2) want a new directory column (`tenants.provisionedBy`) or a
   separate ownership table? Reaping/quota both read it, so it should be indexed.

## 9. Killing the double registry: the managed-tenants projection

§8 as first drafted leaves a smell: the console keeps its own `controlplane_tenant` registry while
the platform directory also holds every tenant — **two writers about the same facts** (exists,
status, entitlements), and a CP-less vertical cannot read the directory to reconcile (#302). The
fix is not reconciliation; it is removing the second authority.

### 9.1 Ownership split

| Fact | Owner | Console's copy |
|---|---|---|
| tenant exists / status / entitlements | platform directory (authoritative, as always) | read-only **projection**, platform-written |
| plan choice, billing refs, display metadata | console (its own domain) | its own table, keyed by tenant id |
| provisioning in flight | the intent | read locally from `_substrat_platform_requests` |

### 9.2 Mechanism — the projection pattern Substrat already uses

The platform already pushes authoritative state *into* scopes instead of letting scopes call up:
entitlements at provision (#310, read via `ctx.entitlement`), and scope-local permissions
(projected on every tenant-level write; `reconcileTenantProjection` is the back-fill). This is the
same move one level up:

- Every tenant records `provisionedBy` (§8 invariant 2 — needed anyway for quota/audit/reap).
- On any lifecycle change to a tenant with `provisionedBy = M` (created / suspended / entitlement
  change / reaped), the platform **re-projects that tenant's row into M's console scope** — e.g. a
  `_substrat_managed_tenants` spine table (module code may read spine tables, never write them).
- The platform sweep re-projects as self-heal, exactly as scope-local permissions do.

### 9.3 Consequences for a manager vertical

- It never writes existence/status. Its own table holds only its domain facts; listings JOIN
  against the projection. A reaped tenant disappears from the projection — no drift possible.
- "Pending" is the intent's own status; the console needs no status column at all.
  Lifecycle: intent `pending` → platform effects → projection row appears → intent `done`.
- Failure mode improves categorically: from "two writers disagree" to "bounded staleness of a
  platform-maintained cache" — the consistency model Substrat already accepted for permissions
  and entitlements.
- Generic: ANY manager vertical gets its customer list for free from the same projector.

### 9.4 Trade-offs

- Eventually consistent: a just-provisioned tenant appears after settle+projection (a truthful
  "provisioning…" row in the UI, rather than an instantly-active local row).
- Substrat-side addition: the projector + spine table. Small — it composes the existing projection
  machinery with `provisionedBy` — but it is new surface, and the alternative (a narrow directory
  read-API for managers) was rejected because it re-opens the upward-call door #302 closed.
