# @authhero/drizzle

## 0.56.2

### Patch Changes

- Updated dependencies [2d20db2]
  - @authhero/proxy@0.8.0

## 0.56.1

### Patch Changes

- 8c75922: Add five new analytics metrics to the `/analytics/{resource}` API and the admin
  Analytics dropdown: Logouts (`slo`, `flo`), Password Changes (`scp`, `fcp`,
  `scpr`, `fcpr`), MFA (`gd_auth_succeed`, `gd_auth_failed`, `gd_auth_rejected`),
  Email Verifications (`sv`, `fv`, `svr`, `fvr`) and Codes Sent (`cls`, `cs`).
  Each is computed from the existing `logs` table — like the existing login/signup
  metrics — and supports the same `time`, `connection`, `client_id`, `user_type`
  and `event` group-by dimensions, so success/failure can be split via
  `group_by=event`. Wired through the kysely, drizzle and Cloudflare Analytics
  Engine adapters.
- Updated dependencies [8c75922]
  - @authhero/adapter-interfaces@3.4.1
  - @authhero/proxy@0.7.5

## 0.56.0

### Minor Changes

- 9b7879c: Add tenant export/import for migrating a tenant between databases (e.g.
  PlanetScale → a per-tenant Workers-for-Platforms D1).

  - New `GET /api/v2/tenant-data/export` streams a gzipped JSON-lines export of a
    tenant's durable data (one `{ entity, data }` record per line). Password
    hashes are excluded unless `?include_password_hashes=true` is set, which
    requires the additional `read:user_password_hashes` scope. Signing keys and
    ephemeral/audit tables (sessions, refresh tokens, codes, login sessions, logs)
    are never exported.
  - New `POST /api/v2/tenant-data/import` replays an export (gzipped or plain
    JSON-lines) into the current tenant in FK-safe order, returning per-entity
    counts and any non-fatal per-row errors. Importing password hashes requires
    the `create:user_password_hashes` scope. Both operations are written to the
    tenant audit log.
  - Every durable entity adapter's `create`/`set`/`assign` now accepts an
    optional `options.importMetadata` argument so an import can faithfully
    preserve the source row's primary id and `created_at`/`updated_at`. These
    values are NOT part of any public insert schema and cannot be set through the
    normal management-API write routes — only the import path passes them.
  - Added `themes.list(tenant_id)` to the themes adapter (kysely, drizzle, aws).

### Patch Changes

- 2185ce2: Make the Drizzle adapter's multi-statement writes atomic on D1. `sessions.create`, `refreshTokens.create`, `users.create` (with password) and `users.remove` previously wrapped their dependent writes in manual `BEGIN`/`COMMIT`/`ROLLBACK`, which is not atomic on D1's async driver and could leave partial writes on failure. These now go through a `runAtomic` helper that uses `db.batch()` (atomic on D1) when the driver supports it, and falls back to `BEGIN`/`COMMIT`/`ROLLBACK` on better-sqlite3 (used in tests).
- Updated dependencies [9b7879c]
  - @authhero/adapter-interfaces@3.4.0
  - @authhero/proxy@0.7.4

## 0.55.0

### Minor Changes

- 780d524: Track WFP tenant code + database versions on the control plane, and add an upgrade path.

  The tenant row now records what a Workers-for-Platforms tenant is running so the
  control plane can detect drift and drive upgrades:

  - New `database_version` field (the latest migration applied — the schema
    version the deployed bundle targets), alongside the existing
    `worker_version` and `bundle_configuration` fields, which are now actually
    populated.
  - `createCloudflareWfpD1Provisioner` gains `bundleConfiguration` and
    `workerVersion` options (supplied by the operator at build time) and returns
    all three versions in its `ProvisionResult`. The provisioning hook writes them
    back to the tenant row.
  - `createWfpTenantProvisioningHook` gains `onUpgrade(tenantId)`: re-uploads the
    current bundle, reconciles any pending migrations, re-runs the defaults seed,
    and rewrites the recorded versions (marking `provisioning_state` `pending`
    while in flight, `ready`/`failed` on completion).
  - New `POST /api/v2/tenants/{id}/redeploy` management endpoint (control-plane
    only), wired via the new `tenantUpgrade` init option, triggers the upgrade and
    returns the refreshed tenant. Returns `501` when no upgrade handler is
    configured.

### Patch Changes

- Updated dependencies [780d524]
  - @authhero/adapter-interfaces@3.3.0
  - @authhero/proxy@0.7.3

## 0.54.2

### Patch Changes

- cd3d8f4: Keep the parent `login_session` alive when a session is created or renewed.
  Previously only `refresh_tokens` extended their `login_session`'s expiry, so a
  long-lived session could outlive its `login_session` and be orphaned when
  cleanup reaped the `login_session`. `sessions.create` and `sessions.update` now
  bump the parent `login_session`'s `expires_at` (never shortening), mirroring the
  `refresh_tokens` behavior.

## 0.54.1

### Patch Changes

- Updated dependencies [6d19200]
  - @authhero/adapter-interfaces@3.2.0
  - @authhero/proxy@0.7.2

## 0.54.0

### Minor Changes

- 02449c8: Implement the actions feature in the Drizzle adapter. The previously-stubbed `actions`, `actionVersions`, and `actionExecutions` adapters are now fully implemented against three new tables (`actions`, `action_versions`, `action_executions`), matching the Kysely backend: action CRUD with `q` filtering, sequential per-action version numbering with single-deployed-version semantics, and execution create/get with results/logs round-tripping. Tenants using the Drizzle adapter can now use actions without falling back to Kysely.

  The Drizzle migrations have been consolidated into a single fresh `0000_init` baseline (the previous incremental migrations and their drifted drizzle-kit snapshots are removed). This is safe because no Drizzle databases are in production yet; any local Drizzle database must be recreated from the new baseline.

### Patch Changes

- 02449c8: Bring Drizzle adapter `q` filtering to parity with the Kysely adapter. `buildLuceneFilter` now supports a `likeFields` parameter (substring matching, e.g. log descriptions) and the OR branch honors it; a `sanitizeLuceneQuery` helper was added to whitelist fields and prevent tenant-boundary crossing via `q`. Filtering is now wired into the `organizations`, `resourceServers`, `codes`, `flows`, `forms`, and `keys` list operations (previously ignored `q`), and `users` (sanitize + whitelist), `logs` (description), `sessions`, and `refreshTokens` searchable columns were aligned with Kysely.

## 0.53.9

### Patch Changes

- 44e8c0d: Allow codes.get to be called with an empty tenant_id, looking up by code alone — matching loginSessions.get. The /callback and /authorize/resume routes resolve the tenant from the state artifact and call codes.get before the tenant is known.

## 0.53.8

### Patch Changes

- Updated dependencies [e0d6e50]
  - @authhero/proxy@0.7.1

## 0.53.7

### Patch Changes

- Updated dependencies [aedf807]
- Updated dependencies [aedf807]
  - @authhero/adapter-interfaces@3.1.1
  - @authhero/proxy@0.7.0

## 0.53.6

### Patch Changes

- Updated dependencies [fe4941f]
  - @authhero/proxy@0.6.0

## 0.53.5

### Patch Changes

- f64c7c9: Return 409 instead of 500 when creating a tenant whose ID already exists on PlanetScale (MySQL). The duplicate-key detection in `tenants.create` was matching on the lowercase "duplicate key" substring and a few SQLite codes, neither of which fires for PlanetScale's "Duplicate entry '...' for key 'PRIMARY'" message. Broaden detection to cover the MySQL message text plus `ER_DUP_ENTRY`, the SQLite extended codes (`SQLITE_CONSTRAINT_UNIQUE`, `SQLITE_CONSTRAINT_PRIMARYKEY`), D1's `AlreadyExists`, and the PostgreSQL `23505` SQLSTATE — mirroring what `organizations.create` already does.

## 0.53.4

### Patch Changes

- Updated dependencies [429f88a]
  - @authhero/adapter-interfaces@3.1.0
  - @authhero/proxy@0.5.1

## 0.53.3

### Patch Changes

- Updated dependencies [ac8a7a2]
- Updated dependencies [ac8a7a2]
  - @authhero/proxy@0.5.0

## 0.53.2

### Patch Changes

- Updated dependencies [3482bd3]
- Updated dependencies [8b8b117]
  - @authhero/adapter-interfaces@3.0.0
  - @authhero/proxy@0.4.5

## 0.53.1

### Patch Changes

- Updated dependencies [d45a6b6]
  - @authhero/adapter-interfaces@2.13.1
  - @authhero/proxy@0.4.4

## 0.53.0

### Minor Changes

- 7a0606f: Add tenant deployment / provisioning fields (`deployment_type`, `provisioning_state`, `bundle_configuration`, `worker_version`, `worker_script_name`, `storage_kind`, `d1_database_id`, plus `provisioning_error` and `provisioning_state_changed_at`). Existing tenants default to `shared` / `ready` via DB-level defaults; no behavior change.

  Adds a `TenantProvisioner` adapter interface (`packages/authhero/src/provisioning`) and a `NoopTenantProvisioner` implementation, exposed via `AuthHeroConfig.provisioner`. Lays the groundwork for provisioning per-tenant Cloudflare Workers from the control-plane API; the noop is correct for `shared` tenants and stands in until the WFP provisioner is wired in.

### Patch Changes

- Updated dependencies [7a0606f]
  - @authhero/adapter-interfaces@2.13.0
  - @authhero/proxy@0.4.3

## 0.52.6

### Patch Changes

- Updated dependencies [64e5f01]
  - @authhero/adapter-interfaces@2.12.0
  - @authhero/proxy@0.4.2

## 0.52.5

### Patch Changes

- b195d31: Outbox-driven replication of `custom_domains` and `proxy_routes` mutations to a global proxy control plane.
  - New `ControlPlaneSyncDestination` and `controlPlaneSync` config block on `AuthHeroConfig`. When configured, every successful create/update/delete on the tenant shard enqueues a `controlplane.sync.*` outbox event that POSTs to `${baseUrl}/api/v2/proxy/control-plane/sync` on the control-plane instance. No-op for single-DB deployments.
  - New `POST /api/v2/proxy/control-plane/sync` endpoint mounted when `proxyControlPlane.applySyncEvents` is provided. New `createApplySyncEvents({ customDomains, proxyRoutes })` factory wires an idempotent adapter-backed receiver — handles duplicate creates, out-of-order updates, and deletes of already-removed rows.
  - `proxyRouteInsertSchema` gains an optional `id` field so the receiver can preserve the source-shard id; the `@authhero/kysely-adapter` and `@authhero/drizzle` `proxyRoutes.create` adapters now use `input.id` when supplied (falling back to `nanoid()`).
  - `LogsDestination` and `LogStreamDestination` filters extended to exclude `controlplane.sync.*` events so replication tasks don't pollute audit logs.

- Updated dependencies [b195d31]
- Updated dependencies [9149210]
  - @authhero/adapter-interfaces@2.11.0
  - @authhero/proxy@0.4.1

## 0.52.4

### Patch Changes

- Updated dependencies [6f4477f]
  - @authhero/proxy@0.4.0

## 0.52.3

### Patch Changes

- Updated dependencies [3bef633]
- Updated dependencies [3bef633]
  - @authhero/adapter-interfaces@2.10.0
  - @authhero/proxy@0.3.3

## 0.52.2

### Patch Changes

- Updated dependencies [1fb1bd1]
  - @authhero/adapter-interfaces@2.9.1
  - @authhero/proxy@0.3.2

## 0.52.1

### Patch Changes

- Updated dependencies [8b9ef23]
  - @authhero/adapter-interfaces@2.9.0
  - @authhero/proxy@0.3.1

## 0.52.0

### Minor Changes

- 1b7a39b: Add a `proxy_routes` table (migration `0004_proxy_routes.sql`) and `ProxyRoutesAdapter` implementation, surfaced as `createAdapters(db).proxyRoutes`. New `createProxyDataAdapter(db)` helper returns a full `ProxyDataAdapter` (CRUD + cross-tenant `resolveHost`) for the `@authhero/proxy` data plane reading from the same Drizzle/D1 database.
- 1b7a39b: Proxy v2: replace the legacy `path_pattern` + `upstream_type` + fixed two-phase middleware model with a JSON-configured route schema (`match` + ordered `handlers`) and a Hono-native execution model. Routes now match on path **plus** method, host pattern (`*.example.com`), request headers, and query params. Handlers are composable `(c, next) => Response` middleware compiled into a per-host Hono sub-app — they can short-circuit, reorder (e.g. `cache` before `basic_auth`), and post-process responses. Built-in handlers cover the legacy custom-domains proxy: `http`, `service_binding` (Cloudflare bindings via the new `bindings` option on `createProxyApp`), `redirect`, `static`, `cors`, `basic_auth`, `headers`, `cache`, `forwarded_headers` (X-Real-IP / X-Original-URL / X-Forwarded-\*), `rewrite_cookies` (upstream `Domain=`), and `rewrite_location` (3xx Location origin). New `createHttpProxyAdapter` reads route config from a remote AuthHero control plane over `client_credentials`, with an optional `createCacheApiHostCache` layer that uses `caches.default` for per-colo warmth (no KV needed). AuthHero exposes the privileged `GET /api/v2/proxy/control-plane/hosts/:host` endpoint via the new `proxyControlPlane` config option. Kysely and Drizzle adapters ship forward migrations that backfill existing rows; the legacy `path_pattern`/`upstream_type`/`upstream_url`/`preserve_host`/`middleware` columns are replaced with JSON `match` and `handlers`.

### Patch Changes

- Updated dependencies [1b7a39b]
- Updated dependencies [1b7a39b]
- Updated dependencies [1b7a39b]
  - @authhero/adapter-interfaces@2.8.0
  - @authhero/proxy@0.3.0

## 0.51.2

### Patch Changes

- Updated dependencies [28a6135]
  - @authhero/adapter-interfaces@2.7.0

## 0.51.1

### Patch Changes

- Updated dependencies [528e196]
  - @authhero/adapter-interfaces@2.6.1

## 0.51.0

### Minor Changes

- dcc6501: Migrate to Zod 4 and `@hono/zod-openapi` v1. The `@hono/zod-openapi` peer dependency now requires `^1.4.0` — consumers must upgrade alongside this release.

### Patch Changes

- Updated dependencies [dcc6501]
  - @authhero/adapter-interfaces@2.6.0

## 0.50.2

### Patch Changes

- Updated dependencies [1bcf864]
  - @authhero/adapter-interfaces@2.5.0

## 0.50.1

### Patch Changes

- Updated dependencies [b6e628b]
  - @authhero/adapter-interfaces@2.4.0

## 0.50.0

### Minor Changes

- 3b086bc: Add `from_date` / `to_date` (Unix seconds) query params to the `GET /api/v2/logs` endpoint and propagate them through the kysely, drizzle, and Cloudflare Analytics Engine adapters. The admin UI now exposes these as filter inputs and reads `length` as the total count, fixing pagination beyond the first page when the backend reports `length` instead of `total`.

### Patch Changes

- Updated dependencies [3b086bc]
  - @authhero/adapter-interfaces@2.3.0

## 0.49.1

### Patch Changes

- Updated dependencies [5e35511]
- Updated dependencies [5e35511]
  - @authhero/adapter-interfaces@2.2.0

## 0.49.0

### Minor Changes

- e9bef63: Add `/api/v2/analytics/*` — richer stats endpoints with filtering, breakdowns, and a ClickHouse-style `{ meta, data }` wire format.

  **Five resources** under `/api/v2/analytics/`: `active-users`, `logins`, `signups`, `refresh-tokens`, `sessions`. Each accepts the same shared parameter shape — `from`, `to`, `interval`, `tz`, repeatable `connection`/`client_id`/`user_type`/`user_id` filters, comma-separated `group_by`, plus `limit`/`offset`/`order_by`. Per-resource grouping rules are validated server-side and rejections return a problem+json body with the offending `param`.

  **Wire format** is `{ meta, data, rows, rows_before_limit_at_least, statistics }`, identical to Cloudflare Analytics Engine's SQL output, so the response can be passed straight into Recharts, Tremor, ECharts, Observable Plot, or any ClickHouse-speaking BI tool with zero adapter code.

  **New `AnalyticsAdapter`** in `@authhero/adapter-interfaces`. Implementations:
  - `@authhero/cloudflare-adapter` — `createAnalyticsEngineAnalyticsAdapter`, compiles each query to a single parameterized SQL statement against the Analytics Engine dataset; tenant predicate is injected server-side and never trusted from request input.
  - `@authhero/kysely-adapter` and `@authhero/drizzle` — SQL fallbacks against the `logs` table for local dev and tests (`day` / `hour` / `month` intervals; week is rejected). Active-users uses `COUNT(DISTINCT user_id)`.

  **Response caching** uses the existing `CacheAdapter` (Cloudflare cache in workers, in-memory locally — no new KV needed). TTL is picked based on how recent the `to` boundary is: 60s for the live window, 5m for last 24h, 1h within yesterday, 24h for older windows. Cache keys are namespaced by `tenant_id` and normalize the query string so semantically-equivalent requests share an entry.

  **Guard rails**: `limit` capped at 10000; `interval=hour` rejected for ranges over 30 days; ungrouped queries can't request more than ~50k rows.

  **New scope**: `read:analytics` (alongside `auth:read`).

  **React-admin**: new `/analytics` page with resource picker, time-range presets, group-by toggles, connection/client filters, line + bar charts, and CSV export.

### Patch Changes

- 52aba15: Tighten `/api/v2/stats/daily` and `/api/v2/stats/active-users` to match Auth0's semantics.

  **`logins` no longer over-counts.** All three stats adapters (kysely, drizzle, cloudflare/analytics-engine) now count only `s` (SUCCESS_LOGIN) as a login. Previously they also summed token exchanges (`seacft`, `seccft`, `sepft`, `sertft`) and silent auth (`ssa`), which inflated the figure substantially for SPAs that refresh tokens frequently. Auth0's daily-stats `logins` is just successful logins, so the numbers now line up.

  **`leaked_passwords` matches Auth0's definition.** Adapters now sum only `pwd_leak` (breached-password detection). The authhero-internal `signup_pwd_leak` and `reset_pwd_leak` variants are no longer included in this metric.

  **`/stats/active-users` only counts real logins.** Same narrowing — distinct users with a `SUCCESS_LOGIN` in the last 30 days, not distinct users who happened to exchange a refresh token.

  **Zero-fill in `/stats/daily`.** The route now returns one row per day in the requested range, including days with no events (Auth0 behavior). Previously consumers got gaps for empty days, breaking graphs that iterate the array sequentially.

- Updated dependencies [e9bef63]
- Updated dependencies [7c8668d]
  - @authhero/adapter-interfaces@2.1.0

## 0.48.0

### Minor Changes

- 63bf3a9: Move `disable_sign_ups` from the client to the connection. The flag now lives on `connection.options.disable_signup` (already present in the schema, now wired into the signup path), and the client-level `disable_sign_ups` column / field has been removed.

  **Why:** the client flag gated every connection through a single switch, which forced federated and HRD-routed logins through the same block as password signup — there was no way to allow new users in via an enterprise OIDC connection while still gating database signups. The new shape lets each connection decide independently. `hide_sign_up_disabled_error` stays on the client because it is a UX (enumeration-safety) decision, not a signup-gating one.

  **Where it's enforced:**
  - `preUserSignupHook` resolves the connection passed to it (by name, falling back to strategy) and checks `options.disable_signup` — this is the authoritative check, and runs for all signup methods including federated/HRD callback.
  - The identifier / login / passwordless screens read `disable_signup` off the `Username-Password-Authentication` connection only, since those screens decide whether to show the "Sign up" link before the user has chosen an IdP.

  **Migration / breaking change:** the kysely and drizzle migrations backfill `options.disable_signup = true` onto every connection whose id appears in the `connections` array of a client with `disable_sign_ups = true`, then drop the client column. If multiple clients share a connection and only one had signups disabled, the connection now blocks signup for all of them — this is the natural consequence of moving from client-scope to connection-scope. Customers relying on the previous "this app doesn't onboard but other apps do" semantics for a shared connection should express that with a pre-user-registration action instead.

### Patch Changes

- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
  - @authhero/adapter-interfaces@2.0.0

## 0.47.0

### Minor Changes

- 1ea694f: Promote `disable_sign_ups` from `client_metadata` to a typed top-level `boolean` field on `Client`, and add a new `hide_sign_up_disabled_error` flag for enumeration-safe sign-up blocking.

  When `disable_sign_ups` is true and `hide_sign_up_disabled_error` is also true, the identifier screen no longer reveals that an email is unknown: it advances to the OTP/password challenge as if the account existed and fails generically at credential check. Skips OTP/magic-link delivery to unknown addresses in this stub path. Useful for tenants where email enumeration is a stronger concern than the UX cost of stranded users.

  Adds a migration that copies `client_metadata.disable_sign_ups = "true"` into the new column and removes the key from `client_metadata` so there is a single source of truth going forward. The legacy `client_metadata.disable_sign_ups` key is no longer read by the engine.

### Patch Changes

- 1ea694f: Add an Auth0-compatible **Actions Executions** API.
  - New `action_executions` storage entity and adapter (`get`, `create`).
  - New management API endpoint `GET /api/v2/actions/executions/:id` returning the Auth0-shape execution object (`id`, `trigger_id`, `status`, `results[]`, `created_at`, `updated_at`). See https://auth0.com/docs/api/management/v2/actions/get-execution.
  - Per-action console output is now captured and exposed via the AuthHero-specific endpoint `GET /api/v2/actions/executions/:id/logs` (Auth0 keeps these in a separate real-time logs stream rather than the executions API; we co-locate them so admins have one place to look).
  - New dry-run endpoint `POST /api/v2/actions/actions/:id/test` runs an action through the executor with a caller-supplied event payload and returns the result synchronously. Does not persist an execution or replay API calls.
  - The hook runtime now writes one execution record per trigger fire (post-login, credentials-exchange, pre-/post-user-registration), aggregating each action's result into the `results[]` array — matching Auth0's per-trigger semantics. Per-hook `sh`/`fh` log entries are no longer emitted from action paths; the credentials-exchange path stamps the resulting tenant log with `details.execution_id` so admins can navigate from a log entry to the execution detail.
  - React-admin: action edit page gets a "Test action" panel with per-trigger payload fixtures; the log detail view gets an "Action Execution" tab that resolves `details.execution_id` and shows per-action timings, errors, and captured console output.

  The internal trigger id `post-user-login` is normalized to Auth0's `post-login` when persisted in execution records.

  The Drizzle adapter ships an `actionExecutions` stub that throws — same pattern as the existing `actions` stub — since action storage is not yet implemented for Drizzle. Use the Kysely adapter when actions are needed.

- 1ea694f: Hook dispatch now honors `priority` order. `hooks.list` returns rows ordered by `priority` desc with `created_at_ts` asc as tiebreaker, so the order configured in the Actions Triggers UI (and any other priority you set) determines the runtime execution order. Previously hooks ran in arbitrary DB order. Callers that pass an explicit `sort` keep that behavior.
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
  - @authhero/adapter-interfaces@1.19.0

## 0.46.0

### Minor Changes

- 2ea1664: Add `branding.dark_mode` and rebuild the Universal Login custom-template pipeline on modern chip chrome with fine-grained slot tokens.

  **`branding.dark_mode`** — AuthHero-specific (Auth0 has no equivalent).
  - `brandingSchema` gains an optional `dark_mode` field accepting `"dark"`, `"light"`, or `"auto"`. Persisted in a new `dark_mode` column on the `branding` table (kysely + drizzle migrations included).
  - The universal login pages honor it as the initial color scheme when no `ah-dark-mode` cookie is set. The per-user cookie still overrides at runtime.

  **Universal Login custom-template pipeline rewrite.**
  The legacy `.page-footer` chrome (used only when a tenant uploaded a custom Liquid template) is gone. Both the default page and tenant-customized pages now share the modern chip chrome from `WidgetPage`, with the body content driven by slot tokens.
  - New slot tokens, scoped to the body fragment:
    - `{%- auth0:widget -%}` — widget mount (required)
    - `{%- authhero:logo -%}` — top-left logo chip
    - `{%- authhero:settings -%}` — top-right chip combining dark-mode toggle + language picker
    - `{%- authhero:dark-mode-toggle -%}` — dark-mode button only
    - `{%- authhero:language-picker -%}` — language picker only
    - `{%- authhero:powered-by -%}` — bottom-left powered-by chip
    - `{%- authhero:legal -%}` — bottom-right legal chip
  - **Breaking:** The `PUT /api/v2/branding/templates/universal-login` body is now a body fragment (not a full HTML document). It only needs to include `{%- auth0:widget -%}`. The legacy `{%- auth0:head -%}` / `{%- auth0:footer -%}` slots no longer expand — tenants on the old format must migrate to the new slot tokens. Page shell (CSS, dark-mode runtime, background tint, body layout) is now fixed by AuthHero, not part of the tenant template.
  - `GET /api/v2/branding/templates/universal-login` returns the AuthHero default body (instead of 404) when no custom template is stored, so tenants can fetch it as a starting point.
  - The react-admin universal-login tab is updated for the new tokens, validation, and documentation.

### Patch Changes

- Updated dependencies [2ea1664]
- Updated dependencies [2ea1664]
  - @authhero/adapter-interfaces@1.18.0

## 0.45.1

### Patch Changes

- 0c662c0: Add deployment history for actions and fix the runtime lookup that prevented Auth0-style actions from firing.
  - The post-login (and other code-hook) dispatcher previously only resolved code via the legacy `data.hookCode` table. Actions created through the Auth0-compatible `POST /api/v2/actions/actions` API live in `data.actions` and were silently skipped at runtime. `handleCodeHook` now resolves `code_id` from `data.actions` first and falls back to `data.hookCode`, so deployed actions bound to a trigger actually run.
  - New `actionVersions` adapter (kysely + stub for drizzle) plus a `2026-05-10` migration creating the `action_versions` table. A version row is snapshotted on every action create and on every `POST /api/v2/actions/actions/:id/deploy`, with the latest snapshot marked `deployed: true` and any prior versions cleared.
  - New management API routes: `GET /api/v2/actions/actions/:actionId/versions`, `GET /api/v2/actions/actions/:actionId/versions/:id`, and `POST /api/v2/actions/actions/:actionId/versions/:id/deploy` (rollback). Rollback re-deploys the rolled-back version's code via the configured `codeExecutor` and snapshots a new version row so history reflects the rollback.
  - Deleting an action now also removes its version history.

- Updated dependencies [0c662c0]
  - @authhero/adapter-interfaces@1.17.0

## 0.45.0

### Minor Changes

- 7dd280c: Add Auth0-compatible email-template management (`/api/v2/email-templates`).

  Tenants can now `POST/GET/PUT/PATCH` template overrides keyed by Auth0's
  template names (`reset_email`, `verify_email`, `verify_email_by_code`,
  `reset_email_by_code`, `welcome_email`, etc.). Bodies are HTML+Liquid; at send
  time the auth flows look up the override (or fall back to a bundled default
  authored as react-email JSX components and pre-rendered to HTML at build time)
  and render it with `liquidjs` before handing off to `EmailServiceAdapter.send()`.
  Tenants on Mailgun-side templates keep working — the legacy template name and
  `data` dict are still passed through unchanged.

  Schema: new `email_templates` table keyed by `(tenant_id, template)` with the
  Auth0 fields (`body`, `from`, `subject`, `syntax`, `resultUrl`,
  `urlLifetimeInSeconds`, `includeEmailInRedirect`, `enabled`). Both the Kysely
  and Drizzle adapters ship parallel implementations.

### Patch Changes

- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [45f719e]
  - @authhero/adapter-interfaces@1.16.0

## 0.44.4

### Patch Changes

- Updated dependencies [639ab29]
  - @authhero/adapter-interfaces@1.15.0

## 0.44.3

### Patch Changes

- Updated dependencies [85d1d06]
  - @authhero/adapter-interfaces@1.14.0

## 0.44.2

### Patch Changes

- Updated dependencies [e0cd449]
- Updated dependencies [86fe6e8]
- Updated dependencies [f41b85c]
- Updated dependencies [3891832]
  - @authhero/adapter-interfaces@1.13.0

## 0.44.1

### Patch Changes

- 32aacc6: Add `default_client_id` to the tenant schema. `/connect/start` now prefers this client as the login_session anchor for tenant-level DCR consent flows, falling back to the first available client so a brand-new tenant can still bootstrap its first integration. Roughly analogous to Auth0's "Default App" / Global Client.
- Updated dependencies [32aacc6]
- Updated dependencies [a4e29bd]
- Updated dependencies [32aacc6]
- Updated dependencies [6e5762c]
- Updated dependencies [32aacc6]
  - @authhero/adapter-interfaces@1.12.0

## 0.44.0

### Minor Changes

- 21b0608: Add Auth0-style refresh-token rotation and at-rest hashing.
  - New wire format `rt_<lookup>.<secret>`. The `lookup` slice is indexed in `refresh_tokens.token_lookup`; only the SHA-256 of the secret is persisted in `token_hash`. Internal ULID `id` stays as the primary key.
  - New per-client config in `Client.refresh_token`: `rotation_type: "rotating" | "non-rotating"` (default `non-rotating`) and `leeway` seconds (default 30). Set `rotation_type: "rotating"` to opt a client into rotation.
  - Each rotation issues a fresh child sharing `family_id` with the parent. Re-presenting a rotated parent within `leeway` mints a sibling (concurrent-call tolerance); outside `leeway` it triggers reuse detection and revokes the entire family via the new `revokeFamily` adapter method.
  - Admin `DELETE /api/v2/refresh_tokens/:id` now also revokes the rest of the family.
  - Backwards compatible: legacy id-only refresh tokens keep working until `2026-06-05`. After that date a follow-up PR removes the legacy fallback.

### Patch Changes

- Updated dependencies [21b0608]
- Updated dependencies [ea5ec43]
- Updated dependencies [90e9906]
  - @authhero/adapter-interfaces@1.11.0

## 0.43.5

### Patch Changes

- Updated dependencies [e5cbfe7]
- Updated dependencies [dd071e0]
  - @authhero/adapter-interfaces@1.10.3

## 0.43.4

### Patch Changes

- 3230b9b: Hook metadata bag + control-plane template inheritance.

  Adds a free-form `metadata: Record<string, unknown>` field to all hook variants (web, form, template, code), persisted as JSON in kysely + drizzle. Two well-known keys are defined:
  - `metadata.inheritable: true` — when set on a hook on the control-plane tenant, the multi-tenancy runtime fallback surfaces that hook on every sub-tenant's `hooks.list` and `hooks.get`. Inherited hooks are read-only from the sub-tenant's perspective: writes go through the base adapter's `tenant_id` WHERE clause and are silent no-ops on cross-tenant rows.
  - Template options. The dispatcher forwards `hook.metadata` to the template function. The `account-linking` template reads `metadata.copy_user_metadata: true` to merge the secondary user's `user_metadata` into the primary's on link (primary wins on key conflicts; `app_metadata` is never copied).

  Includes the kysely migration `2026-04-29T10:00:00_hooks_metadata` adding the `metadata` column.

- e8e7411: Defensively parse the hook `metadata` JSON blob on read.

  Wraps `JSON.parse` in a try/catch in `hooks.get` and `hooks.list` (kysely + drizzle) and only accepts the result when it's a plain object. Malformed payloads, arrays, primitives, or legacy rows now collapse to `undefined` instead of throwing — a single corrupt row no longer breaks hook retrieval for the whole tenant. Adds a shared `parseJsonObjectIfDefined` helper next to `parseJsonIfDefined` in the kysely adapter.

- Updated dependencies [3230b9b]
  - @authhero/adapter-interfaces@1.10.2

## 0.43.3

### Patch Changes

- 4d06f0d: Make user linking opt-in via the `account-linking` template hook.

  The legacy `linkUsersHook` has been renamed to `commitUserHook` and the email-based primary-user lookup is now an explicit option (`resolveEmailLinkedPrimary`). Whether it runs is controlled by:
  - A new service-level `userLinkingMode` option on `init()` — `"builtin"` (default, current behaviour) or `"off"` (template only). The template hook is controlled independently via the management API regardless of mode.
  - A per-client `user_linking_mode` field on the `Client` schema that overrides the service-level default for a single application — useful for validating the template-driven path on one client before flipping the whole tenant.

  The `account-linking` template hook is now a registered template (`template_id: "account-linking"`) and supports three triggers: `post-user-login` (existing), `post-user-registration`, and `post-user-update`. Tenants enable it via the management API:

  ```json
  {
    "trigger_id": "post-user-registration",
    "template_id": "account-linking",
    "enabled": true
  }
  ```

  `hookTemplates[<id>].trigger_id` (singular) is now `trigger_ids` (array) to support multi-trigger templates.

  Adds the kysely migration `2026-04-28T10:00:00_client_user_linking_mode` and extends the drizzle clients schema to add the `user_linking_mode` column.

- Updated dependencies [4d06f0d]
  - @authhero/adapter-interfaces@1.10.1

## 0.43.2

### Patch Changes

- Updated dependencies [ba03e14]
  - @authhero/adapter-interfaces@1.10.0

## 0.43.1

### Patch Changes

- Updated dependencies [2578652]
  - @authhero/adapter-interfaces@1.9.0

## 0.43.0

### Minor Changes

- 02cebf4: Add RFC 7591 Dynamic Client Registration and RFC 7592 Client Configuration endpoints with Initial Access Token support.
  - `POST /oidc/register` (RFC 7591 §3): create a client, optionally gated by an Initial Access Token (IAT). Open DCR can be enabled by setting `tenant.flags.dcr_require_initial_access_token = false`.
  - `GET/PUT/DELETE /oidc/register/:client_id` (RFC 7592): self-service client configuration using the registration access token returned at registration time.
  - New `client_registration_tokens` table (kysely + drizzle) holding both IATs and RATs with SHA-256 hashed storage.
  - New `clients` columns: `owner_user_id`, `registration_type`, `registration_metadata`.
  - New tenant flags: `dcr_require_initial_access_token`, `dcr_allowed_grant_types`.
  - Discovery (`.well-known/openid-configuration`) now only emits `registration_endpoint` when `flags.enable_dynamic_client_registration = true`.
  - RFC 7591 `redirect_uris` is mapped to/from AuthHero's internal `callbacks` field at the wire boundary — the Management API continues to use `callbacks` unchanged.

### Patch Changes

- Updated dependencies [48eab09]
- Updated dependencies [02cebf4]
  - @authhero/adapter-interfaces@1.8.0

## 0.42.0

### Minor Changes

- 9145dbd: Drop the multi-statement transaction from `refreshTokens.update`. The previous implementation ran UPDATE + SELECT + UPDATE inside `db.transaction()` to extend the parent `login_session` expiry, which on async HTTP drivers (PlanetScale, D1) meant three sequential round-trips plus BEGIN/COMMIT and held a row lock on `login_sessions` across the whole transaction — creating a hot-row hotspot when multiple refresh tokens shared a `login_id`.
  - Add optional `UpdateRefreshTokenOptions.loginSessionBump` to the adapter interface. The caller now provides `login_id` and the pre-computed new `expires_at`, so the adapter avoids a read-before-write.
  - `refreshTokens.update` issues the refresh-token and login-session UPDATEs concurrently via `Promise.all`, collapsing wall-clock latency to roughly one round-trip on async drivers. The bump is idempotent (`WHERE expires_at_ts < new`) and self-healing (next refresh re-bumps on a transient failure), so strict atomicity is not required.
  - Fix `ctx.req.header["x-real-ip"]` / `["user-agent"]` — Hono exposes `header` as a function, so bracket access has been silently writing empty strings to `device.last_ip` / `device.last_user_agent` since the grant landed. Use `ctx.req.header("x-real-ip")` and skip the `device` write entirely when IP and UA are unchanged.

### Patch Changes

- Updated dependencies [9145dbd]
- Updated dependencies [9145dbd]
  - @authhero/adapter-interfaces@1.7.0

## 0.41.0

### Minor Changes

- 7d9f138: Soft-revoke refresh tokens instead of hard-deleting them. Adds a `revoked_at` field to the `RefreshToken` schema, a `revokeByLoginSession(tenant_id, login_session_id, revoked_at)` adapter method, and a `refresh_tokens.revoked_at_ts` column. The logout route now issues a single bulk UPDATE (fixing a pagination bug where sessions with >100 refresh tokens were not fully revoked), and the refresh-token grant rejects revoked tokens with an `invalid_grant` error.

### Patch Changes

- Updated dependencies [7d9f138]
  - @authhero/adapter-interfaces@1.6.0

## 0.40.0

### Minor Changes

- 31b0b62: Update the adapters

### Patch Changes

- f27884d: Move `login_sessions.authParams` entirely into the JSON blob column `auth_params` and drop the 18 legacy hoisted `authParams_*` columns.

  The backfill migration (`2026-04-20T11:00:00`) reconstructs `auth_params` from the hoisted columns for any row where it is still NULL, guaranteeing the blob is populated before the columns are removed. The follow-up migration (`2026-04-20T12:00:00`) then drops all 18 hoisted columns from `login_sessions` and removes the `login_sessions_client_fk` foreign key that referenced `authParams_client_id`. On MySQL this is a straightforward `DROP FOREIGN KEY` + `DROP COLUMN` sequence; on SQLite the table is recreated because SQLite rejects `DROP COLUMN` on FK-referenced columns.

  The adapter now writes and reads authParams exclusively via the JSON blob. DB-level referential integrity between `login_sessions` and `clients` is no longer enforced — the client_id lives inside the blob, which cannot be foreign-keyed. Adding a new field to `AuthParams` no longer requires a schema migration.

  The Drizzle/D1 adapter has been updated to match: `src/schema/sqlite/sessions.ts` now declares `auth_params` and drops the hoisted `authParams_*` columns, the login-sessions adapter reads/writes via the blob, and a new `drizzle/0004_login_sessions_auth_params_blob.sql` migration backfills and drops the hoisted columns. The AWS (DynamoDB) adapter already stored authParams as a JSON string, so no change was required there.

## 0.39.0

### Minor Changes

- 931f598: Add `GET /authorize/resume` endpoint mirroring Auth0's terminal login-session resumption point.

  Sub-flows now persist the authenticated identity onto the login session (new `auth_strategy` and `authenticated_at` columns on `login_sessions`) and 302 the browser to `/authorize/resume?state=…`. The resume endpoint owns (a) hopping back to the original authorization host when the browser is on the wrong custom domain so the session cookie lands under the right wildcard, and (b) dispatching based on the login-session state machine to the final token/code issuance or to the next MFA/continuation screen.

  The social OAuth callback is migrated as the first consumer: the old 307-POST cross-domain re-dispatch in `connectionCallback` is replaced by a plain 302 to `/authorize/resume`, and the OAuth code exchange now always runs once on whichever host the provider called back to. Subsequent PRs will migrate the password / OTP / signup / SAML sub-flows to the same pattern, after which the ad-hoc `Set-Cookie` forwarding layers in Universal Login can be removed.

### Patch Changes

- Updated dependencies [931f598]
  - @authhero/adapter-interfaces@1.5.0

## 0.38.2

### Patch Changes

- 6503423: Fix cleanup deleting `login_sessions` while child `refresh_tokens` are still valid.

  `refreshTokens.create` and `refreshTokens.update` now extend the parent
  `login_sessions.expires_at_ts` to match the refresh token's longest expiry, in
  the same DB transaction. Previously the initial token exchange never bumped
  the login_session, so cleanup could delete the parent while its refresh tokens
  were still valid.

## 0.38.1

### Patch Changes

- Updated dependencies [1d15292]
  - @authhero/adapter-interfaces@1.4.1

## 0.38.0

### Minor Changes

- d288b62: Add support for dynamic workers

## 0.37.0

### Minor Changes

- d84cb2f: Complete the transaction fixes

### Patch Changes

- Updated dependencies [d84cb2f]
  - @authhero/adapter-interfaces@1.4.0

## 0.36.0

### Minor Changes

- 2f6354d: Make session lifetime cofigurable

### Patch Changes

- Updated dependencies [2f6354d]
  - @authhero/adapter-interfaces@1.3.0

## 0.35.0

### Minor Changes

- b2aff48: Durable post-hooks with self-healing and dead-letter support.
  - Moved post-user-registration and post-user-deletion webhook delivery from inline invocation to the outbox, with `Idempotency-Key: {event.id}` headers and retry-with-backoff.
  - `EventDestination` gained an optional `accepts(event)` filter so `LogsDestination`, `WebhookDestination`, and `RegistrationFinalizerDestination` can share the same event stream without cross-writing.
  - Added `outbox.deadLetter`, `listFailed`, and `replay` to `OutboxAdapter`; the relay now moves exhausted events to dead-letter instead of silently marking them processed.
  - New `GET /api/v2/failed-events` and `POST /api/v2/failed-events/:id/retry` management endpoints for operating the dead-letter queue.
  - Self-healing: added `registration_completed_at` to the user; set by `RegistrationFinalizerDestination` (outbox path) or inline after successful synchronous webhook dispatch. `postUserLoginHook` re-enqueues the post-user-registration event on the next login when the flag is still null, so transient delivery failures recover automatically.
  - Removed the global management-api transaction middleware: pre-registration webhooks and user-authored action code no longer execute inside a held DB transaction. Individual write paths own their own atomicity (see `linkUsersHook`, `createUserUpdateHooks`, `createUserDeletionHooks`).
  - Added `users.rawCreate` to the adapter interface so the registration commit path can write without re-entering decorator hooks.
  - New `account-linking` pre-defined post-login hook (`preDefinedHooks.accountLinking`) and corresponding template, matching Auth0's marketplace linking action. Idempotent: re-running on every login is safe.
  - Non-Workers runtimes (Node, tests) now flush background promises via the outbox middleware so `waitUntil`-scheduled work completes before the response returns.

### Patch Changes

- Updated dependencies [b2aff48]
  - @authhero/adapter-interfaces@1.2.0

## 0.34.1

### Patch Changes

- Updated dependencies [3da602c]
  - @authhero/adapter-interfaces@1.1.0

## 0.34.0

### Minor Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

### Patch Changes

- Updated dependencies [20d5140]
  - @authhero/adapter-interfaces@1.0.0

## 0.33.0

### Minor Changes

- a59a49b: Implement disable-sso

### Patch Changes

- Updated dependencies [a59a49b]
  - @authhero/adapter-interfaces@0.155.0

## 0.32.0

### Minor Changes

- fa7ce07: Update drizzle for production use
- fa7ce07: Updates for passkeys login

### Patch Changes

- Updated dependencies [fa7ce07]
  - @authhero/adapter-interfaces@0.154.0

## 0.31.3

### Patch Changes

- Updated dependencies [884e950]
  - @authhero/adapter-interfaces@0.153.0

## 0.31.2

### Patch Changes

- Updated dependencies [f3b910c]
  - @authhero/adapter-interfaces@0.152.0

## 0.31.1

### Patch Changes

- Updated dependencies [3e74dea]
- Updated dependencies [022f12f]
  - @authhero/adapter-interfaces@0.151.0

## 0.31.0

### Minor Changes

- 164fe2c: Added passkeys

### Patch Changes

- Updated dependencies [164fe2c]
  - @authhero/adapter-interfaces@0.150.0

## 0.30.0

### Minor Changes

- 7c52f88: Fix setup guide bugs

## 0.29.0

### Minor Changes

- d9c2ad1: Fixes to mfa-signup and new account screens

## 0.28.0

### Minor Changes

- 64e858a: Add mfa with logging

### Patch Changes

- Updated dependencies [64e858a]
  - @authhero/adapter-interfaces@0.149.0

## 0.27.6

### Patch Changes

- Updated dependencies [469c395]
  - @authhero/adapter-interfaces@0.148.0

## 0.27.5

### Patch Changes

- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
  - @authhero/adapter-interfaces@0.147.0

## 0.27.4

### Patch Changes

- Updated dependencies [318fcf9]
- Updated dependencies [318fcf9]
  - @authhero/adapter-interfaces@0.146.0

## 0.27.3

### Patch Changes

- Updated dependencies [30b5be1]
  - @authhero/adapter-interfaces@0.145.0

## 0.27.2

### Patch Changes

- Updated dependencies [dcbd1d7]
  - @authhero/adapter-interfaces@0.144.0

## 0.27.1

### Patch Changes

- Updated dependencies [39df1aa]
  - @authhero/adapter-interfaces@0.143.0

## 0.27.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

### Patch Changes

- Updated dependencies [1a72b93]
  - @authhero/adapter-interfaces@0.142.0

## 0.26.1

### Patch Changes

- Updated dependencies [3de697d]
  - @authhero/adapter-interfaces@0.141.0

## 0.26.0

### Minor Changes

- 7154fe1: Update refresh-tokens schema

### Patch Changes

- Updated dependencies [7154fe1]
  - @authhero/adapter-interfaces@0.140.0

## 0.25.1

### Patch Changes

- Updated dependencies [2617efb]
  - @authhero/adapter-interfaces@0.139.0

## 0.25.0

### Minor Changes

- 192f480: First step in refresh tokens refactor

### Patch Changes

- Updated dependencies [192f480]
  - @authhero/adapter-interfaces@0.138.0

## 0.24.1

### Patch Changes

- Updated dependencies [0719de4]
  - @authhero/adapter-interfaces@0.137.0

## 0.24.0

### Minor Changes

- d7bcd19: Add hook templates

### Patch Changes

- Updated dependencies [d7bcd19]
  - @authhero/adapter-interfaces@0.136.0

## 0.23.1

### Patch Changes

- Updated dependencies [65321b7]
  - @authhero/adapter-interfaces@0.135.0

## 0.23.0

### Minor Changes

- 00e9cf7: Add support for forms in the u2 login

## 0.22.4

### Patch Changes

- Updated dependencies [a5c1ba9]
  - @authhero/adapter-interfaces@0.134.0

## 0.22.3

### Patch Changes

- Updated dependencies [7adc7dc]
  - @authhero/adapter-interfaces@0.133.0

## 0.22.2

### Patch Changes

- Updated dependencies [131ea43]
  - @authhero/adapter-interfaces@0.132.0

## 0.22.1

### Patch Changes

- Updated dependencies [c5935bd]
  - @authhero/adapter-interfaces@0.131.0

## 0.22.0

### Minor Changes

- bf22ac7: Add support for inlang

## 0.21.0

### Minor Changes

- ac8af37: Add custom text support

### Patch Changes

- Updated dependencies [ac8af37]
  - @authhero/adapter-interfaces@0.130.0

## 0.20.4

### Patch Changes

- Updated dependencies [a8e70e6]
  - @authhero/adapter-interfaces@0.129.0

## 0.20.3

### Patch Changes

- Updated dependencies [6585906]
  - @authhero/adapter-interfaces@0.128.0

## 0.20.2

### Patch Changes

- Updated dependencies [fd374a9]
- Updated dependencies [8150432]
  - @authhero/adapter-interfaces@0.127.0

## 0.20.1

### Patch Changes

- Updated dependencies [154993d]
  - @authhero/adapter-interfaces@0.126.0

## 0.20.0

### Minor Changes

- 491842a: Bump packages to make sure the universal_login_templates is available

### Patch Changes

- Updated dependencies [491842a]
  - @authhero/adapter-interfaces@0.125.0

## 0.19.0

### Minor Changes

- 2be02f8: Add dynamic liquid templates

### Patch Changes

- Updated dependencies [2af900c]
- Updated dependencies [2be02f8]
  - @authhero/adapter-interfaces@0.124.0

## 0.18.0

### Minor Changes

- 2d0a7f4: Add a auth0-conformance flag

### Patch Changes

- Updated dependencies [2d0a7f4]
  - @authhero/adapter-interfaces@0.123.0

## 0.17.0

### Minor Changes

- 49039c0: Add profile data for primary user in indentities

## 0.16.0

### Minor Changes

- 846a92c: Split the migrations

## 0.15.0

### Minor Changes

- 168b585: Update the schemas for the sessions

## 0.14.1

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0

## 0.14.0

### Minor Changes

- 967d470: Add a metadata field to roles and resource-servers

### Patch Changes

- Updated dependencies [2853db0]
- Updated dependencies [967d470]
  - @authhero/adapter-interfaces@0.121.0

## 0.13.1

### Patch Changes

- Updated dependencies [00d2f83]
  - @authhero/adapter-interfaces@0.120.0

## 0.13.0

### Minor Changes

- 8ab8c0b: Start adding xstate

### Patch Changes

- Updated dependencies [8ab8c0b]
  - @authhero/adapter-interfaces@0.119.0

## 0.12.0

### Minor Changes

- 3d3fcc0: Migrate connections

## 0.11.1

### Patch Changes

- Updated dependencies [b7bb663]
  - @authhero/adapter-interfaces@0.118.0

## 0.11.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0

## 0.10.4

### Patch Changes

- Updated dependencies [9c15354]
  - @authhero/adapter-interfaces@0.116.0

## 0.10.3

### Patch Changes

- Updated dependencies [f738edf]
  - @authhero/adapter-interfaces@0.115.0

## 0.10.2

### Patch Changes

- Updated dependencies [17d73eb]
- Updated dependencies [e542773]
  - @authhero/adapter-interfaces@0.114.0

## 0.10.1

### Patch Changes

- Updated dependencies [d967833]
  - @authhero/adapter-interfaces@0.113.0

## 0.10.0

### Minor Changes

- 3dcc620: Use migrations from drizzle

## 0.9.0

### Minor Changes

- b778aed: Seed mananagement roles and create organizations

## 0.8.0

### Minor Changes

- ae8553a: Add is_system to all adapters

### Patch Changes

- Updated dependencies [ae8553a]
  - @authhero/adapter-interfaces@0.112.0

## 0.7.0

### Minor Changes

- 100b1bd: Patch the redirect action for flows

## 0.6.0

### Minor Changes

- 02567cd: Make create authhero work with d1 locally

### Patch Changes

- Updated dependencies [906337d]
  - @authhero/adapter-interfaces@0.111.0

## 0.5.2

### Patch Changes

- Updated dependencies [a108525]
  - @authhero/adapter-interfaces@0.110.0

## 0.5.1

### Patch Changes

- Updated dependencies [1bec131]
  - @authhero/adapter-interfaces@0.109.0

## 0.5.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

## 0.4.22

### Patch Changes

- Updated dependencies [0e906aa]
  - @authhero/adapter-interfaces@0.108.0

## 0.4.21

### Patch Changes

- Updated dependencies [212f5c6]
  - @authhero/adapter-interfaces@0.107.0

## 0.4.20

### Patch Changes

- Updated dependencies [f37644f]
  - @authhero/adapter-interfaces@0.106.0

## 0.4.19

### Patch Changes

- Updated dependencies [40caf1a]
  - @authhero/adapter-interfaces@0.105.0

## 0.4.18

### Patch Changes

- Updated dependencies [125dbb9]
  - @authhero/adapter-interfaces@0.104.0

## 0.4.17

### Patch Changes

- Updated dependencies [b0c4421]
- Updated dependencies [c96d83b]
  - @authhero/adapter-interfaces@0.103.0

## 0.4.16

### Patch Changes

- Updated dependencies [0566155]
- Updated dependencies [0566155]
  - @authhero/adapter-interfaces@0.102.0

## 0.4.15

### Patch Changes

- Updated dependencies [0ffb5ca]
  - @authhero/adapter-interfaces@0.101.0

## 0.4.14

### Patch Changes

- Updated dependencies [3a0d8ee]
  - @authhero/adapter-interfaces@0.100.0

## 0.4.13

### Patch Changes

- Updated dependencies [a3c69f0]
  - @authhero/adapter-interfaces@0.99.0

## 0.4.12

### Patch Changes

- Updated dependencies [6067f00]
  - @authhero/adapter-interfaces@0.98.0

## 0.4.11

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.97.0

## 0.4.10

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.96.0

## 0.4.9

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.95.0

## 0.4.8

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.94.0

## 0.4.7

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.93.0

## 0.4.6

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.92.0

## 0.4.5

### Patch Changes

- Updated dependencies [149ab91]
- Updated dependencies [b0e9595]
  - @authhero/adapter-interfaces@0.91.0

## 0.4.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.90.0

## 0.4.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.89.0

## 0.4.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.88.0

## 0.4.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.87.0

## 0.4.0

### Minor Changes

- Add users to organizations

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.86.0

## 0.3.13

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.85.0

## 0.3.12

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.84.0

## 0.3.11

### Minor Changes

- Add type to keys

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.83.0

## 0.3.10

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.82.0

## 0.3.9

### Patch Changes

- Updated dependencies [fc8153d]
  - @authhero/adapter-interfaces@0.81.0

## 0.3.8

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.80.0

## 0.3.7

### Minor Changes

- Add resource servers, rules and permissions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.79.0

## 0.3.6

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.78.0

## 0.3.5

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.77.0

## 0.3.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.76.0

## 0.3.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.75.0

## 0.3.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.74.0

## 0.3.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.73.0

## 0.3.0

### Minor Changes

- Create refresh tokens for code grant flow

## 0.2.32

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.72.0

## 0.2.31

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.71.0

## 0.2.30

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.70.0

## 0.2.29

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.69.0

## 0.2.28

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.68.0

## 0.2.27

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.67.0

## 0.2.26

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.66.0

## 0.2.25

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.65.0

## 0.2.24

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.64.0

## 0.2.23

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.63.0

## 0.2.22

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.62.0

## 0.2.21

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.61.0

## 0.2.20

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.60.0

## 0.2.19

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.59.0

## 0.2.18

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.58.0

## 0.2.17

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.57.0

## 0.2.16

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.56.0

## 0.2.15

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.55.0

## 0.2.14

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.54.0

## 0.2.13

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.53.0

## 0.2.12

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.52.0

## 0.2.11

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.51.0

## 0.2.10

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.50.0

## 0.2.9

### Patch Changes

- Updated dependencies [a9959ad]
  - @authhero/adapter-interfaces@0.49.0

## 0.2.8

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.48.0

## 0.2.7

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.47.0

## 0.2.6

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.46.0

## 0.2.5

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.45.0

## 0.2.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.44.0

## 0.2.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.43.0

## 0.2.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.42.0

## 0.2.1

### Patch Changes

- Updated dependencies [23c2899]
  - @authhero/adapter-interfaces@0.41.0

## 0.2.0

### Minor Changes

- Add refresh tokens to jwt

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.40.0

## 0.1.76

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.39.0

## 0.1.75

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.38.0

## 0.1.74

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.37.0

## 0.1.73

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.36.0

## 0.1.72

### Patch Changes

- Updated dependencies
- Updated dependencies [a0a18c9]
  - @authhero/adapter-interfaces@0.35.0

## 0.1.71

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.34.0

## 0.1.70

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.33.0

## 0.1.69

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.32.1

## 0.1.68

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.32.0

## 0.1.67

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.31.0

## 0.1.66

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.30.0

## 0.1.65

### Patch Changes

- Updated dependencies [fbc0e55]
  - @authhero/adapter-interfaces@0.29.1

## 0.1.64

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.29.0

## 0.1.63

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.28.0

## 0.1.62

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.27.0

## 0.1.61

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.26.0

## 0.1.60

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.25.0

## 0.1.59

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.24.0

## 0.1.58

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.23.0

## 0.1.57

### Patch Changes

- remove the iife build files
- Updated dependencies
  - @authhero/adapter-interfaces@0.22.1

## 0.1.56

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.22.0

## 0.1.55

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.21.0

## 0.1.54

### Patch Changes

- Expose the migration script for kysely and add authhero test
- Updated dependencies
  - @authhero/adapter-interfaces@0.20.3

## 0.1.53

### Patch Changes

- Update packages
- Updated dependencies
  - @authhero/adapter-interfaces@0.20.2

## 0.1.52

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.20.1

## 0.1.51

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.20.0

## 0.1.50

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.19.0

## 0.1.49

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.18.0

## 0.1.48

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.17.1

## 0.1.47

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.17.0

## 0.1.46

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.16.0

## 0.1.45

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.6

## 0.1.44

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.5

## 0.1.43

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.4

## 0.1.42

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.3

## 0.1.41

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.2

## 0.1.40

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.1

## 0.1.39

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.0

## 0.1.38

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.14.0

## 0.1.37

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.13.0

## 0.1.36

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.12.0

## 0.1.35

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.9

## 0.1.34

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.8

## 0.1.33

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.7

## 0.1.32

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.6

## 0.1.31

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.5

## 0.1.30

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.4

## 0.1.29

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.3

## 0.1.28

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.2

## 0.1.27

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.1

## 0.1.26

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.0

## 0.1.25

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.5

## 0.1.24

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.4

## 0.1.23

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.3

## 0.1.22

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.2

## 0.1.21

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.1

## 0.1.20

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.0

## 0.1.19

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.9.2

## 0.1.18

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.9.1

## 0.1.17

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.9.0

## 0.1.16

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.8.0

## 0.1.15

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.7.0

## 0.1.14

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.6.0

## 0.1.13

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.5.3

## 0.1.12

### Patch Changes

- Updated dependencies [3625688]
  - @authhero/adapter-interfaces@0.5.2

## 0.1.11

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.5.1

## 0.1.10

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.5.0

## 0.1.9

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.4.0

## 0.1.8

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.3.1

## 0.1.7

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.3.0

## 0.1.6

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.2.2

## 0.1.5

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.2.1

## 0.1.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.1.3
