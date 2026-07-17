# @authhero/multi-tenancy

## 14.27.1

### Patch Changes

- c3c4546: chore: apply repo-wide Prettier formatting

  Formatting-only sweep, no behavior change. Generated output (Stencil loader/hydrate,
  drizzle-kit migration metadata, the built tailwind CSS blob) is now listed in
  `.prettierignore` so it is not reformatted on every build, and `lint-staged` runs in
  the pre-commit hook to keep formatting from drifting again.

- Updated dependencies [c3c4546]
- Updated dependencies [089c6d2]
  - @authhero/adapter-interfaces@4.2.1
  - authhero@8.26.1

## 14.27.0

### Minor Changes

- 74f1373: Auto-provision a default/anchor client at tenant creation (issue #1007).

  New tenants now come with a designated interactive default client by construction, so tenant-level flows that need an anchor (e.g. the DCR `/connect/start` consent flow) no longer silently fall back to an arbitrary — possibly M2M — client.

  - New shared `provisionDefaultClients()` helper (exported from `authhero`) creates an interactive first-party "Default App", sets `tenant.default_client_id` to it, and provisions an M2M "API Explorer" client authorized against the Management API. It is idempotent and import-safe: it respects an already-set `default_client_id`, reuses an existing interactive client instead of duplicating, and skips the M2M client when one already exists. The Default App is created with no connections, so all of the tenant's connections are offered at login.
  - Wired into both tenant-creation paths: the `seed`/bootstrap script and the multi-tenancy `afterCreate` provisioning hook (pooled tenants; isolated tenants are seeded via their own database provisioning).
  - `/connect/start` now falls back to the first _interactive_ client (via the new `isInteractiveClient` helper) instead of `clients[0]`, so it never anchors on an M2M client.
  - `PATCH /tenants/settings` now rejects a `default_client_id` that doesn't reference an existing, interactive client (both the management-api and multi-tenancy handlers).
  - Provisioning now recovers from a partial prior run: if the M2M "API Explorer" client exists but its Management API grant is missing (e.g. a run that failed between creating the client and its grant), a re-run restores the grant instead of returning early.

### Patch Changes

- Updated dependencies [74f1373]
- Updated dependencies [2f62e0b]
  - authhero@8.18.0

## 14.26.0

### Minor Changes

- 88f2bf7: Record tenant lifecycle operations and expose them via the management API (issue #1026, phase 1).

  - `@authhero/multi-tenancy` gains an operations module: `runRecordedTenantOperation` wraps `databaseIsolation.onProvision` so every provision writes a `tenant_operations` row with step events (no behavior change — recording is skipped when the adapters are absent and is warn-only on write failure), plus `createInlineExecutor` / `enqueueTenantOperation` implementing the row-first executor contract the Cloudflare Workflows engine plugs into next. `initMultiTenant` wires a default inline executor for `upgrade` operations when `tenantUpgrade` is configured.
  - `authhero` mounts `GET /api/v2/operations/{id}`, `GET/POST /api/v2/tenants/{id}/operations` (new scopes `read:tenant_operations`, `create:tenant_operations`) when the control-plane operations adapters are present, with a new `tenantOperationExecutor` config binding.
  - `@authhero/cloudflare-adapter`'s WFP provisioning hook accepts an optional step reporter and surfaces `provision-resources` / `seed-defaults` boundaries; reporting can never fail a provision.

### Patch Changes

- d8dac78: Add the `@authhero/cloudflare-adapter/workflows` subpath (issue #1026 phase 2): durable provision-as-workflow for WFP tenants on Cloudflare Workflows.

  - `runProvisionOperation` runs the provisioner steps (via the provider-agnostic `TenantProvisionerSteps` contract) as one durable engine step each — with the defaults seed as a retried step _before_ `ready` and a `verify` step that throws until the tenant D1 actually holds signing keys and its tenant row. "Ready over an empty D1" is no longer possible.
  - `createCloudflareWorkflowsExecutor` implements the row-first `TenantOperationExecutor` contract over a structural Workflows binding (no `cloudflare:workers` import in the library; the downstream worker owns the ~10-line `WorkflowEntrypoint` shell — see `entrypoint.example.ts`).
  - `reconcileTenantOperations` sweeps operations stuck in `pending`/`running` whose engine instance died before its terminal write, copying terminal engine states into the control-plane log (run from a `scheduled` handler, at least daily).
  - `createWfpWorkflowProvisioningHook` replaces inline provisioning with a durable enqueue on tenant create; upgrade/deprovision keep delegating to the inline hook. Wire with `databaseIsolation.recordProvisionOperations: false` (new `@authhero/multi-tenancy` flag) since the workflow owns the operation row.

- Updated dependencies [6258d34]
- Updated dependencies [5b50504]
- Updated dependencies [88f2bf7]
- Updated dependencies [7023dd5]
  - authhero@8.15.0
  - @authhero/adapter-interfaces@3.6.0

## 14.25.1

### Patch Changes

- 3b77bf0: Seed the FK-target `tenants` rows into a WFP tenant's database via the defaults
  payload, so a freshly provisioned tenant worker can write — not just read
  (#972).

  A freshly migrated tenant D1 only has the empty `tenants` table the migrations
  create. D1 enforces the `tenant_id -> tenants(id)` foreign key, so every
  tenant-scoped insert (the tenant's own `POST /api/v2/connections`, and the
  projected control-plane defaults keyed under the control-plane tenant id)
  FK-failed with a 500 until those rows existed.

  - `@authhero/multi-tenancy`: `ControlPlaneDefaultsPayload` now carries a
    `tenants` array of minimal (`id` + `friendly_name`) seed rows, gated by a new
    `tenants` flag on `DefaultsPayloadEntities` (default `true`).
    `buildControlPlaneDefaultsPayload` takes an optional `targetTenantId` and
    emits the control-plane tenant row plus the target tenant's own row;
    `applyControlPlaneDefaultsPayload` upserts those rows **first**
    (create-if-missing, so a re-sync never clobbers a tenant's later edits) and
    reports the outcome under `result.tenants`.
  - `@authhero/cloudflare-adapter`: `createDispatchSyncDefaults` passes the target
    tenant id through to the payload build, so a `/internal/sync-defaults` push
    seeds both FK-target rows before applying the defaults.

- Updated dependencies [3b77bf0]
- Updated dependencies [3b77bf0]
  - authhero@8.7.0

## 14.25.0

### Minor Changes

- 02449c8: Add a transport-agnostic control-plane defaults **wire contract** to
  `@authhero/multi-tenancy` for pushing shared state into per-tenant databases
  (e.g. a Workers-for-Platforms tenant's D1):

  - `buildControlPlaneDefaultsPayload(controlPlaneAdapters, controlPlaneTenantId, entities?)`
    reads the control plane's inheritable connections, `is_system` resource
    servers, `inheritable` hooks, email provider, branding, prompt settings, and
    its **public** `jwt_signing` keys into a `ControlPlaneDefaultsPayload`.
  - `applyControlPlaneDefaultsPayload(payload, targetAdapters, controlPlaneTenantId, options?)`
    applies a payload to a tenant adapter, reusing the same idempotent upsert/filter
    path as `projectControlPlaneDefaults` and adding a dedicated signing-key path.

  Signing keys are projected as a first-class but **security-sensitive** entity:
  `pkcs7` (private key) is stripped on build and re-stripped on apply, keys are
  stored with no `tenant_id` (so `listControlPlaneKeys` resolves them for
  verification), and they are create-if-missing by `kid`.

  `authhero` now exports `listControlPlaneKeys`, `resolveSigningKeys`, and
  `resolveSigningKeyMode` so the control-plane key selection has a single source
  of truth reused by the projection.

### Patch Changes

- Updated dependencies [02449c8]
- Updated dependencies [02449c8]
  - authhero@8.5.0

## 14.24.1

### Patch Changes

- c76247b: Fix tenant deletion returning a 500 instead of the real status, and make tenant create/delete authorization symmetric.

  - **Single Hono instance.** The build no longer inlines a second copy of Hono. The Rollup `external` config only matched the bare `hono` package, so the subpath import `hono/http-exception` was still bundled — giving the package its own `HTTPException` class. The host app's `instanceof HTTPException` check then failed and legitimate 401/403/404s surfaced as generic 500s. Subpath exports are now externalized too, so `hono` (and `@hono/zod-openapi`) resolve to the host app's single instance.
  - **Super-admin delete path.** `DELETE /tenants/{id}` now lets a non-org-scoped control-plane token carrying the `delete:tenants` scope (or `admin:organizations`, mirroring the list route) delete any tenant without per-organization membership. Previously a tenant created via the API/UI by a global admin — who is deliberately not added to the tenant's organization by the provisioning hook — became undeletable through the API.

- Updated dependencies [70e2dae]
- Updated dependencies [c76247b]
- Updated dependencies [70e2dae]
  - authhero@8.4.1

## 14.24.0

### Minor Changes

- 51993f6: Add control-plane defaults projection for Workers-for-Platforms tenants, plus keyed (multi-key) encryption at rest.

  WFP tenants run in their own Worker with their own database and cannot read the control plane's database at request time, so runtime fallback has nothing to resolve against. Instead, the control plane's inheritable defaults (connections, `is_system` resource servers, `inheritable` hooks, email provider, branding, prompt settings) are now **projected into each tenant's own database under the control plane tenant id** — the existing `withRuntimeFallback` resolves them with no read-path change.

  `@authhero/multi-tenancy` adds:

  - `projectControlPlaneDefaults(config, targetTenantId)` — idempotent (upsert-by-id) projection of the control plane's defaults bundle into a tenant database.
  - `createDirectRolloutAdapter(config)` returning a `ControlPlaneRolloutAdapter` (`syncDefaults` / `syncDefaultsToTenants`). The adapter is the seam for execution strategy: inline today, swappable for a durable Cloudflare Workflows implementation later without changing callers.

  `authhero` adds keyed encryption so a tenant can hold inherited secrets at rest without being able to decrypt them:

  - The `enc:v1:` field-encryption format gains an optional key id (`enc:v1:<keyId>:<payload>`), fully backward compatible with existing unkeyed values.
  - `createEncryptedDataAdapterWithKeyRing(data, ring, { resolveEncryptKeyId })` encrypts each tenant's secrets under a key selected from a `KeyRing` (e.g. control-plane-tenant rows under a control-plane-only key id), choosing the key on read from the id embedded in the ciphertext.
  - New low-level helpers `encryptFieldWithRing`, `decryptFieldWithRing`, `parseKeyId`, and the `KeyRing` / `EncryptKeyIdResolver` types.

  Existing single-key `createEncryptedDataAdapter` and all current ciphertext are unchanged.

### Patch Changes

- Updated dependencies [51993f6]
  - authhero@8.3.0

## 14.23.1

### Patch Changes

- aedf807: Add a Danger zone to the tenant settings Advanced tab with a confirmation-gated delete button, hide the default delete button at the top of the settings edit page, and fix the access check on `DELETE /tenants/{id}` so tokens carrying an `org_name` claim that matches the target tenant pass without a redundant control-plane membership lookup (which was rejecting valid org-scoped tokens).
- Updated dependencies [aedf807]
- Updated dependencies [aedf807]
  - @authhero/adapter-interfaces@3.1.1
  - authhero@7.2.2

## 14.23.0

### Minor Changes

- dcc6501: Migrate to Zod 4 and `@hono/zod-openapi` v1. The `@hono/zod-openapi` peer dependency now requires `^1.4.0` — consumers must upgrade alongside this release.

### Patch Changes

- Updated dependencies [1fd754b]
- Updated dependencies [dcc6501]
  - authhero@5.9.0
  - @authhero/adapter-interfaces@2.6.0

## 14.22.0

### Minor Changes

- 14a66d6: Remove the `auth:read` / `auth:write` super-scopes. Every management-api route now requires its specific Auth0-style scope (e.g. `read:users`, `create:clients`, `update:connections`). Tokens that previously relied on `auth:read` or `auth:write` must be reissued with the granular scopes for each endpoint they call.

### Patch Changes

- Updated dependencies [667681b]
- Updated dependencies [14a66d6]
  - authhero@5.7.0

## 14.21.0

### Minor Changes

- 063910b: Add a `resolveControlPlane` option to `initMultiTenant` and `withRuntimeFallback` for per-tenant runtime inheritance. The resolver receives `{ tenant_id }` and returns the control plane (`{ tenantId, clientId? }`) to inherit from, or `undefined` to opt that tenant out of inheritance entirely. Mirrors the shape of `signingKeyMode` / `userLinkingMode` in authhero so isolated tenants can be excluded from connection, hook, resource-server, and email-provider fallback without forking the adapter setup.

  Access control, sync direction, and tenant management routing continue to use the static `controlPlane.tenantId` and are not affected by the resolver. Existing static `controlPlaneTenantId` / `controlPlaneClientId` usage is unchanged.

### Patch Changes

- 063910b: Stop merging control-plane client URLs into `clients.get`/`getByClientId` at the adapter layer. The merge previously surfaced inherited `callbacks`, `web_origins`, `allowed_logout_urls`, and `allowed_origins` everywhere the adapter was read — including the management API, which caused the admin UI to display (and on save, persist) URLs that actually belonged to the control-plane client. The URL merge now happens in authhero's `getEnrichedClient` helper, which only auth-flow code paths use; storage reads from the management API and DCR see the tenant's raw stored values.

  The `mergeClientWithFallback` helper is now exported from `@authhero/multi-tenancy` so external runtimes can apply the merge themselves if they bypass `getEnrichedClient`.

- Updated dependencies [063910b]
- Updated dependencies [9a57e8f]
- Updated dependencies [9a57e8f]
  - authhero@5.3.1

## 14.20.3

### Patch Changes

- 85d1d06: Fix `GET /api/v2/tenants` returning 403 for users who only have organization membership (no `read:tenants` or `auth:read` scope). The route now requires authentication only; the handler filters by control-plane organization membership and returns an empty list when the user has no accessible tenants.
- Updated dependencies [85d1d06]
- Updated dependencies [85d1d06]
  - authhero@4.112.0
  - @authhero/adapter-interfaces@1.14.0

## 14.20.2

### Patch Changes

- e79c7d9: Fix tenant-list authorization bypass for org-scoped tokens. `GET /tenants` previously returned every tenant whenever the caller's token carried `admin:organizations` or `auth:read`, but `admin:organizations` is also granted via org-scoped roles — so any organization admin received cross-tenant visibility. The full-access shortcut now only applies when the token has no `org_id` claim, and the route additionally requires the `read:tenants` or `auth:read` scope.

## 14.20.1

### Patch Changes

- 3230b9b: Hook metadata bag + control-plane template inheritance.

  Adds a free-form `metadata: Record<string, unknown>` field to all hook variants (web, form, template, code), persisted as JSON in kysely + drizzle. Two well-known keys are defined:
  - `metadata.inheritable: true` — when set on a hook on the control-plane tenant, the multi-tenancy runtime fallback surfaces that hook on every sub-tenant's `hooks.list` and `hooks.get`. Inherited hooks are read-only from the sub-tenant's perspective: writes go through the base adapter's `tenant_id` WHERE clause and are silent no-ops on cross-tenant rows.
  - Template options. The dispatcher forwards `hook.metadata` to the template function. The `account-linking` template reads `metadata.copy_user_metadata: true` to merge the secondary user's `user_metadata` into the primary's on link (primary wins on key conflicts; `app_metadata` is never copied).

  Includes the kysely migration `2026-04-29T10:00:00_hooks_metadata` adding the `metadata` column.

- Updated dependencies [6ddeedc]
- Updated dependencies [3230b9b]
  - authhero@4.107.0
  - @authhero/adapter-interfaces@1.10.2

## 14.20.0

### Minor Changes

- d288b62: Add support for dynamic workers

### Patch Changes

- Updated dependencies [d288b62]
  - authhero@4.98.0

## 14.19.1

### Patch Changes

- 0a3d5d3: Gate resource server scope inheritance on is_system flag and match by id instead of identifier. Apply scope inheritance to the management API adapter so is_system resource servers show their effective scopes from the control plane.

## 14.19.0

### Minor Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

### Patch Changes

- Updated dependencies [20d5140]
  - @authhero/adapter-interfaces@1.0.0
  - authhero@4.91.0

## 14.18.0

### Minor Changes

- f3b910c: Add outbox pattern

### Patch Changes

- Updated dependencies [f3b910c]
  - @authhero/adapter-interfaces@0.152.0
  - authhero@4.82.0

## 14.17.0

### Minor Changes

- 3e74dea: Update handling of host headers

### Patch Changes

- Updated dependencies [3e74dea]
- Updated dependencies [022f12f]
  - @authhero/adapter-interfaces@0.151.0
  - authhero@4.80.0

## 14.16.0

### Minor Changes

- 7c52f88: Fix setup guide bugs

### Patch Changes

- Updated dependencies [7c52f88]
  - authhero@4.76.0

## 14.15.0

### Minor Changes

- 5e73f56: Remove magic strings
- 5e73f56: Replace magic strings

### Patch Changes

- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
  - @authhero/adapter-interfaces@0.147.0
  - authhero@4.67.0

## 14.14.0

### Minor Changes

- 7754a80: Create organization

### Patch Changes

- Updated dependencies [30b5be1]
  - @authhero/adapter-interfaces@0.145.0
  - authhero@4.63.0

## 14.13.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

### Patch Changes

- Updated dependencies [1a72b93]
  - @authhero/adapter-interfaces@0.142.0
  - authhero@4.58.0

## 14.12.0

### Minor Changes

- 818846d: Change to use auth0 instead of auth2

### Patch Changes

- Updated dependencies [818846d]
- Updated dependencies [6476145]
  - authhero@4.45.0

## 14.11.0

### Minor Changes

- b1e8715: Inherit scopes instead of syncing

## 14.10.0

### Minor Changes

- 44b76d9: Do not inherit data for the management api

### Patch Changes

- Updated dependencies [44b76d9]
  - authhero@4.29.0

## 14.9.0

### Minor Changes

- d1df006: Add fallback to control plane client

## 14.8.0

### Minor Changes

- a8e70e6: Fix fallbacks for sms service options
- a8e70e6: Update schemas to remove old fallbacks

### Patch Changes

- Updated dependencies [a8e70e6]
- Updated dependencies [a8e70e6]
  - authhero@4.27.0
  - @authhero/adapter-interfaces@0.129.0

## 14.7.0

### Minor Changes

- 8150432: Replaced legacy client

### Patch Changes

- Updated dependencies [fd374a9]
- Updated dependencies [8150432]
  - @authhero/adapter-interfaces@0.127.0
  - authhero@4.23.0

## 14.6.0

### Minor Changes

- 829afab: Hide sensistive info in management api

### Patch Changes

- Updated dependencies [5519225]
- Updated dependencies [829afab]
- Updated dependencies [76510cd]
  - authhero@4.12.0

## 14.5.0

### Minor Changes

- 9d6cfb8: Wrap adapters as part of the multi-tenant package

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0
  - authhero@4.9.1

## 14.4.0

### Minor Changes

- 967d470: Add a metadata field to roles and resource-servers

### Patch Changes

- Updated dependencies [2853db0]
- Updated dependencies [967d470]
- Updated dependencies [8315e5c]
- Updated dependencies [a98dbc4]
- Updated dependencies [58ca131]
  - @authhero/adapter-interfaces@0.121.0
  - authhero@4.8.0

## 14.3.0

### Minor Changes

- d7e8c95: Update dependencies

## 14.2.0

### Minor Changes

- fb3b47e: Remove hard coded control-plane tenant id

### Patch Changes

- Updated dependencies [fb3b47e]
  - authhero@4.1.0

## 14.1.0

### Minor Changes

- 489db0b: Remove the connection sync
  Created a saas multi-tenant guide

## 14.0.0

### Major Changes

- 3d3fcc0: Move logic over to multi-tenancy

### Minor Changes

- 3d3fcc0: Migrate connections

### Patch Changes

- Updated dependencies [3d3fcc0]
- Updated dependencies [3d3fcc0]
  - authhero@4.0.0

## 13.20.0

### Minor Changes

- b7bb663: Make organizations lowercase

### Patch Changes

- Updated dependencies [b7bb663]
  - @authhero/adapter-interfaces@0.118.0
  - authhero@3.6.0

## 13.19.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0
  - authhero@3.5.0

## 13.18.0

### Minor Changes

- 6dcb42e: Refactor assets

## 13.17.0

### Minor Changes

- 71b01a6: Move authhero to peer dependency

### Patch Changes

- Updated dependencies [71b01a6]
  - authhero@3.3.0

## 13.16.0

### Minor Changes

- 9c15354: Remove shadcn and updated widget

### Patch Changes

- Updated dependencies [9c15354]
  - @authhero/adapter-interfaces@0.116.0
  - authhero@3.2.0

## 13.15.0

### Minor Changes

- 8858622: Move fallbacks to multi-tenancy package

### Patch Changes

- Updated dependencies [63e4ecb]
- Updated dependencies [8858622]
  - authhero@3.1.0

## 13.14.0

### Minor Changes

- 44b751a: Sync connections

## 13.13.3

### Patch Changes

- authhero@3.0.0

## 13.13.2

### Patch Changes

- authhero@2.0.0

## 13.13.1

### Patch Changes

- Updated dependencies [928d358]
  - authhero@1.4.0

## 13.13.0

### Minor Changes

- efaad87: Check for permissions rather than scopes for tenants

## 13.12.1

### Patch Changes

- Updated dependencies [f738edf]
  - @authhero/adapter-interfaces@0.115.0
  - authhero@1.3.0

## 13.12.0

### Minor Changes

- c8c83e3: Add a admin:organizations permission to hande organizations in the control_plane

### Patch Changes

- Updated dependencies [c8c83e3]
  - authhero@1.2.0

## 13.11.0

### Minor Changes

- 17d73eb: Change name of organization flag and add OR support in lucence queries
- e542773: Fixes for syncing resources servers and global roles

### Patch Changes

- Updated dependencies [17d73eb]
- Updated dependencies [e542773]
  - @authhero/adapter-interfaces@0.114.0
  - authhero@1.1.0

## 13.10.1

### Patch Changes

- Updated dependencies [d967833]
  - @authhero/adapter-interfaces@0.113.0
  - authhero@1.0.0

## 13.10.0

### Minor Changes

- aaf0aa0: Fix paging issue for scopes
- aaf0aa0: Update permissions casing

### Patch Changes

- Updated dependencies [aaf0aa0]
- Updated dependencies [aaf0aa0]
  - authhero@0.309.0

## 13.9.0

### Minor Changes

- bbe5492: Add real scopes

### Patch Changes

- Updated dependencies [bbe5492]
  - authhero@0.308.0

## 13.8.1

### Patch Changes

- Updated dependencies [63f9c89]
  - authhero@0.307.0

## 13.8.0

### Minor Changes

- 0f8e4e8: Change from main to control plane
- 3a180df: Fix organization names for main tenant

### Patch Changes

- Updated dependencies [0f8e4e8]
- Updated dependencies [3a180df]
  - authhero@0.306.0

## 13.7.0

### Minor Changes

- aba8ef9: Handle org tokens for the main tenant

### Patch Changes

- Updated dependencies [aba8ef9]
  - authhero@0.305.0

## 13.6.0

### Minor Changes

- 1c36752: Use org tokens for tenants in admin

### Patch Changes

- Updated dependencies [1c36752]
  - authhero@0.304.0

## 13.5.0

### Minor Changes

- b778aed: Seed mananagement roles and create organizations

### Patch Changes

- Updated dependencies [b778aed]
  - authhero@0.303.0

## 13.4.0

### Minor Changes

- 283daf2: Refactor multi-tenancy package
- ae8553a: Add is_system to all adapters

### Patch Changes

- Updated dependencies [283daf2]
- Updated dependencies [ae8553a]
  - authhero@0.302.0
  - @authhero/adapter-interfaces@0.112.0

## 13.3.0

### Minor Changes

- e87ab70: Move tenants crud to multi-tenancy package

## 13.2.0

### Minor Changes

- 9e34783: Sync resource servers for multi tenancy setup

## 13.1.3

### Patch Changes

- Updated dependencies [906337d]
  - @authhero/adapter-interfaces@0.111.0

## 13.1.2

### Patch Changes

- Updated dependencies [a108525]
  - @authhero/adapter-interfaces@0.110.0

## 13.1.1

### Patch Changes

- Updated dependencies [1bec131]
  - @authhero/adapter-interfaces@0.109.0

## 13.1.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

## 13.0.0

### Patch Changes

- Updated dependencies [6929f98]
  - authhero@0.294.0

## 12.0.0

### Patch Changes

- Updated dependencies [85b58c4]
  - authhero@0.293.0

## 11.0.0

### Patch Changes

- Updated dependencies [973a72e]
  - authhero@0.292.0

## 10.0.2

### Patch Changes

- Updated dependencies [0e906aa]
  - @authhero/adapter-interfaces@0.108.0
  - authhero@0.291.2

## 10.0.1

### Patch Changes

- Updated dependencies [212f5c6]
  - @authhero/adapter-interfaces@0.107.0
  - authhero@0.291.1

## 10.0.0

### Patch Changes

- Updated dependencies [5ed04e5]
  - authhero@0.291.0

## 9.0.1

### Patch Changes

- Updated dependencies [f37644f]
  - @authhero/adapter-interfaces@0.106.0
  - authhero@0.290.1

## 9.0.0

### Patch Changes

- Updated dependencies [40caf1a]
  - @authhero/adapter-interfaces@0.105.0
  - authhero@0.290.0

## 8.0.0

### Patch Changes

- Updated dependencies [125dbb9]
  - @authhero/adapter-interfaces@0.104.0
  - authhero@0.289.0

## 7.0.0

### Patch Changes

- Updated dependencies [c51ab9b]
  - authhero@0.288.0

## 6.0.0

### Patch Changes

- Updated dependencies [b0c4421]
- Updated dependencies [c96d83b]
  - @authhero/adapter-interfaces@0.103.0
  - authhero@0.287.0

## 5.0.0

### Patch Changes

- Updated dependencies [65db836]
  - authhero@0.286.0

## 4.0.0

### Patch Changes

- Updated dependencies [e04bae4]
  - authhero@0.285.0

## 3.0.0

### Patch Changes

- Updated dependencies [6952865]
  - authhero@0.284.0

## 2.0.0

### Patch Changes

- Updated dependencies [0566155]
- Updated dependencies [0566155]
  - @authhero/adapter-interfaces@0.102.0
  - authhero@0.283.0

## 1.0.0

### Minor Changes

- 8ab05b4: Add multi-tenancy package

### Patch Changes

- Updated dependencies [8ab05b4]
  - authhero@0.282.0
