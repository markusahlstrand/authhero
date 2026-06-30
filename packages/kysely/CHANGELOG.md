# @authhero/kysely-adapter

## 11.10.2

### Patch Changes

- Updated dependencies [2d20db2]
  - @authhero/proxy@0.8.0

## 11.10.1

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
- 892c7bf: Fix log filtering crashes and missing matches on `q` queries:

  - Values containing Lucene-reserved characters (e.g. a `-`) returned no rows. Clients escape filter values per Lucene rules (a dash becomes `\-`) and quote them, but `luceneFilter` stripped the quotes without reversing the escaping, so exact-match comparisons ran against a backslash-prefixed literal. Lucene escape sequences are now unescaped before the value is used.
  - A free-text term containing a `:` (e.g. a timestamp like `2024-01-01T10:00:00`) or a clause referencing a non-column (e.g. `success`) was misparsed as a column reference and crashed the request with a SQL error. `logs.list` now sanitizes `q` against an allowlist of real columns (as `users`/`organizations` already do) before filtering.
  - Free-text log search now also matches `description` (substring), so searching for a user's email finds failed-login events that happened before any user record existed.

- Updated dependencies [8c75922]
  - @authhero/adapter-interfaces@3.4.1
  - @authhero/proxy@0.7.5

## 11.10.0

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

- Updated dependencies [9b7879c]
  - @authhero/adapter-interfaces@3.4.0
  - @authhero/proxy@0.7.4

## 11.9.0

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

## 11.8.11

### Patch Changes

- cd3d8f4: Keep the parent `login_session` alive when a session is created or renewed.
  Previously only `refresh_tokens` extended their `login_session`'s expiry, so a
  long-lived session could outlive its `login_session` and be orphaned when
  cleanup reaped the `login_session`. `sessions.create` and `sessions.update` now
  bump the parent `login_session`'s `expires_at` (never shortening), mirroring the
  `refresh_tokens` behavior.

## 11.8.10

### Patch Changes

- Updated dependencies [6d19200]
  - @authhero/adapter-interfaces@3.2.0
  - @authhero/proxy@0.7.2

## 11.8.9

### Patch Changes

- e0d6e50: Add `rollup` as an explicit devDependency so the build works on CI where the peer dependency of `rollup-plugin-dts` is not auto-hoisted.
- Updated dependencies [e0d6e50]
  - @authhero/proxy@0.7.1

## 11.8.8

### Patch Changes

- Updated dependencies [aedf807]
- Updated dependencies [aedf807]
  - @authhero/adapter-interfaces@3.1.1
  - @authhero/proxy@0.7.0

## 11.8.7

### Patch Changes

- Updated dependencies [fe4941f]
  - @authhero/proxy@0.6.0

## 11.8.6

### Patch Changes

- f64c7c9: Return 409 instead of 500 when creating a tenant whose ID already exists on PlanetScale (MySQL). The duplicate-key detection in `tenants.create` was matching on the lowercase "duplicate key" substring and a few SQLite codes, neither of which fires for PlanetScale's "Duplicate entry '...' for key 'PRIMARY'" message. Broaden detection to cover the MySQL message text plus `ER_DUP_ENTRY`, the SQLite extended codes (`SQLITE_CONSTRAINT_UNIQUE`, `SQLITE_CONSTRAINT_PRIMARYKEY`), D1's `AlreadyExists`, and the PostgreSQL `23505` SQLSTATE — mirroring what `organizations.create` already does.

## 11.8.5

### Patch Changes

- Updated dependencies [429f88a]
  - @authhero/adapter-interfaces@3.1.0
  - @authhero/proxy@0.5.1

## 11.8.4

### Patch Changes

- 3db954d: Make the database authoritative for custom-domain reads. The Cloudflare wrapper's `list()` now reads straight from the DB instead of fanning out a per-row Cloudflare API call — removing the silent-drop hazard that emptied the admin UI whenever a single Cloudflare GET failed (404, schema mismatch, rate-limit). `create()` and `uploadCertificate()` now mirror the mapped Cloudflare-derived state (`status`, `verification`) back to the DB so list/get can render without depending on Cloudflare being reachable. The kysely `list()` adapter now parses the stored `verification` JSON.

## 11.8.3

### Patch Changes

- Updated dependencies [ac8a7a2]
- Updated dependencies [ac8a7a2]
  - @authhero/proxy@0.5.0

## 11.8.2

### Patch Changes

- Updated dependencies [3482bd3]
- Updated dependencies [8b8b117]
  - @authhero/adapter-interfaces@3.0.0
  - @authhero/proxy@0.4.5

## 11.8.1

### Patch Changes

- Updated dependencies [d45a6b6]
  - @authhero/adapter-interfaces@2.13.1
  - @authhero/proxy@0.4.4

## 11.8.0

### Minor Changes

- 7a0606f: Add tenant deployment / provisioning fields (`deployment_type`, `provisioning_state`, `bundle_configuration`, `worker_version`, `worker_script_name`, `storage_kind`, `d1_database_id`, plus `provisioning_error` and `provisioning_state_changed_at`). Existing tenants default to `shared` / `ready` via DB-level defaults; no behavior change.

  Adds a `TenantProvisioner` adapter interface (`packages/authhero/src/provisioning`) and a `NoopTenantProvisioner` implementation, exposed via `AuthHeroConfig.provisioner`. Lays the groundwork for provisioning per-tenant Cloudflare Workers from the control-plane API; the noop is correct for `shared` tenants and stands in until the WFP provisioner is wired in.

### Patch Changes

- Updated dependencies [7a0606f]
  - @authhero/adapter-interfaces@2.13.0
  - @authhero/proxy@0.4.3

## 11.7.0

### Minor Changes

- 64e5f01: Update migrations to match planetscale

### Patch Changes

- Updated dependencies [64e5f01]
  - @authhero/adapter-interfaces@2.12.0
  - @authhero/proxy@0.4.2

## 11.6.0

### Minor Changes

- 9149210: Enforce OAuth consent for third-party clients on both silent and interactive auth flows.
  - `client.is_first_party` now defaults to `true`. A new kysely migration flips existing clients to `is_first_party = true`, preserving today's no-consent UX. Clients that should be treated as third-party must now set `is_first_party = false` explicitly.
  - New `grants` table and `GrantsAdapter` interface store granted scope per `(tenant, user, clientID, audience)`. Wire shape matches Auth0's `/api/v2/grants` exactly — including the `clientID` (camelCase) field name.
  - Silent auth (`prompt=none`) for a third-party client returns the OIDC `consent_required` error when the requested scopes are not covered by a stored grant. Basic OIDC scopes (`openid`, `profile`, `email`) are exempt.
  - Interactive auth for a third-party client redirects to a new `/u2/consent` screen before issuing a code. Approving the screen records the grant and resumes the original flow.
  - New `LoginSessionState.AWAITING_CONSENT` with `REQUIRE_CONSENT` / `COMPLETE_CONSENT` transitions.
  - Management API: `GET /api/v2/grants`, `DELETE /api/v2/grants/{id}`, and `DELETE /api/v2/grants?user_id=...` — mirrors Auth0's surface. The earlier `/users/{id}/consents` endpoint has been removed.
  - Admin UI: new read-only "Grants" tab on the user detail page.

### Patch Changes

- b195d31: Outbox-driven replication of `custom_domains` and `proxy_routes` mutations to a global proxy control plane.
  - New `ControlPlaneSyncDestination` and `controlPlaneSync` config block on `AuthHeroConfig`. When configured, every successful create/update/delete on the tenant shard enqueues a `controlplane.sync.*` outbox event that POSTs to `${baseUrl}/api/v2/proxy/control-plane/sync` on the control-plane instance. No-op for single-DB deployments.
  - New `POST /api/v2/proxy/control-plane/sync` endpoint mounted when `proxyControlPlane.applySyncEvents` is provided. New `createApplySyncEvents({ customDomains, proxyRoutes })` factory wires an idempotent adapter-backed receiver — handles duplicate creates, out-of-order updates, and deletes of already-removed rows.
  - `proxyRouteInsertSchema` gains an optional `id` field so the receiver can preserve the source-shard id; the `@authhero/kysely-adapter` and `@authhero/drizzle` `proxyRoutes.create` adapters now use `input.id` when supplied (falling back to `nanoid()`).
  - `LogsDestination` and `LogStreamDestination` filters extended to exclude `controlplane.sync.*` events so replication tasks don't pollute audit logs.

- c6df0a9: Widen `user_permissions.resource_server_identifier` from `varchar(21)` back to `varchar(191)`. The 2025-09-11 migration that added `organization_id` accidentally narrowed the column, causing inserts of typical identifiers (URLs, URNs longer than 21 chars such as `urn:authhero:management`) to fail on MySQL/PlanetScale with "Data too long for column", which surfaced as a 500 from `POST /api/v2/users/:user_id/permissions`.
- Updated dependencies [b195d31]
- Updated dependencies [9149210]
  - @authhero/adapter-interfaces@2.11.0
  - @authhero/proxy@0.4.1

## 11.5.4

### Patch Changes

- Updated dependencies [6f4477f]
  - @authhero/proxy@0.4.0

## 11.5.3

### Patch Changes

- Updated dependencies [3bef633]
- Updated dependencies [3bef633]
  - @authhero/adapter-interfaces@2.10.0
  - @authhero/proxy@0.3.3

## 11.5.2

### Patch Changes

- Updated dependencies [1fb1bd1]
  - @authhero/adapter-interfaces@2.9.1
  - @authhero/proxy@0.3.2

## 11.5.1

### Patch Changes

- Updated dependencies [8b9ef23]
  - @authhero/adapter-interfaces@2.9.0
  - @authhero/proxy@0.3.1

## 11.5.0

### Minor Changes

- 1b7a39b: Add a `proxy_routes` table and adapter implementation. The standard migration set (`migrateToLatest`) now creates the table, and `createAdapters(db).proxyRoutes` implements the new `ProxyRoutesAdapter` from `@authhero/adapter-interfaces`. A new `createProxyDataAdapter(db)` helper returns a full `ProxyDataAdapter` (CRUD + cross-tenant `resolveHost`) for the `@authhero/proxy` data plane — this replaces the standalone `@authhero/proxy-kysely` package (which has been removed).
- 1b7a39b: Proxy v2: replace the legacy `path_pattern` + `upstream_type` + fixed two-phase middleware model with a JSON-configured route schema (`match` + ordered `handlers`) and a Hono-native execution model. Routes now match on path **plus** method, host pattern (`*.example.com`), request headers, and query params. Handlers are composable `(c, next) => Response` middleware compiled into a per-host Hono sub-app — they can short-circuit, reorder (e.g. `cache` before `basic_auth`), and post-process responses. Built-in handlers cover the legacy custom-domains proxy: `http`, `service_binding` (Cloudflare bindings via the new `bindings` option on `createProxyApp`), `redirect`, `static`, `cors`, `basic_auth`, `headers`, `cache`, `forwarded_headers` (X-Real-IP / X-Original-URL / X-Forwarded-\*), `rewrite_cookies` (upstream `Domain=`), and `rewrite_location` (3xx Location origin). New `createHttpProxyAdapter` reads route config from a remote AuthHero control plane over `client_credentials`, with an optional `createCacheApiHostCache` layer that uses `caches.default` for per-colo warmth (no KV needed). AuthHero exposes the privileged `GET /api/v2/proxy/control-plane/hosts/:host` endpoint via the new `proxyControlPlane` config option. Kysely and Drizzle adapters ship forward migrations that backfill existing rows; the legacy `path_pattern`/`upstream_type`/`upstream_url`/`preserve_host`/`middleware` columns are replaced with JSON `match` and `handlers`.

### Patch Changes

- Updated dependencies [1b7a39b]
- Updated dependencies [1b7a39b]
- Updated dependencies [1b7a39b]
  - @authhero/adapter-interfaces@2.8.0
  - @authhero/proxy@0.3.0

## 11.4.1

### Patch Changes

- 154ba22: Export `Database` type from `@authhero/kysely-adapter` and `WorkerLoader` (plus `WorkerCode`, `WorkerStub`, `WorkerLoaderCodeExecutorOptions`) from `@authhero/cloudflare-adapter`. These were reachable as parameter types but missing from the public `.d.ts` export list, forcing consumers to recover them via `Parameters<typeof ...>`.
- 28a6135: Add a Description filter to the logs list. The kysely Lucene filter helper now accepts a `likeFields` option so configured fields (currently `description` on logs) match with `LIKE %value%` instead of exact equality, making free-text searches against log descriptions actually useful.
- Updated dependencies [28a6135]
  - @authhero/adapter-interfaces@2.7.0

## 11.4.0

### Minor Changes

- 528e196: Move `kysely` from `dependencies` to `peerDependencies` in `@authhero/kysely-adapter` so consumers control the installed version and avoid duplicate Kysely instances.

  Switch every adapter package's `.d.ts` bundling from `dts-bundle-generator` to `rollup-plugin-dts` (the same tool already used by `authhero`). Adds `export *` for previously-unexported adapter modules in `@authhero/adapter-interfaces` so the new bundler emits them (the old tool re-exported them implicitly).

### Patch Changes

- Updated dependencies [528e196]
  - @authhero/adapter-interfaces@2.6.1

## 11.3.0

### Minor Changes

- dcc6501: Migrate to Zod 4 and `@hono/zod-openapi` v1. The `@hono/zod-openapi` peer dependency now requires `^1.4.0` — consumers must upgrade alongside this release.

### Patch Changes

- Updated dependencies [dcc6501]
  - @authhero/adapter-interfaces@2.6.0

## 11.2.2

### Patch Changes

- Updated dependencies [1bcf864]
  - @authhero/adapter-interfaces@2.5.0

## 11.2.1

### Patch Changes

- Updated dependencies [b6e628b]
  - @authhero/adapter-interfaces@2.4.0

## 11.2.0

### Minor Changes

- 3b086bc: Add `from_date` / `to_date` (Unix seconds) query params to the `GET /api/v2/logs` endpoint and propagate them through the kysely, drizzle, and Cloudflare Analytics Engine adapters. The admin UI now exposes these as filter inputs and reads `length` as the total count, fixing pagination beyond the first page when the backend reports `length` instead of `total`.

### Patch Changes

- Updated dependencies [3b086bc]
  - @authhero/adapter-interfaces@2.3.0

## 11.1.2

### Patch Changes

- Updated dependencies [5e35511]
- Updated dependencies [5e35511]
  - @authhero/adapter-interfaces@2.2.0

## 11.1.1

### Patch Changes

- e529742: Fix `/analytics/*` endpoints returning `Internal Server Error`.
  - `@authhero/cloudflare-adapter`: `createAdapters` now also creates an `analytics` adapter (backed by the Analytics Engine SQL API) when `analyticsEngineLogs` is configured. Previously only `logs` was wired, so consumers that spread the kysely adapter were silently falling through to the kysely analytics path.
  - `@authhero/kysely-adapter`: the analytics time-bucketing SQL used SQLite-only functions (`datetime`, `strftime`) which MySQL/PlanetScale rejected with a 1064 syntax error. The adapter now detects the dialect at runtime and emits portable expressions for UTC, plus MySQL-specific expressions for non-UTC timezones.

## 11.1.0

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

- 7c8668d: Add tenant-level **Migration Sources** for transparently re-minting upstream refresh tokens (#833).

  When a client presents a refresh token that doesn't match a local row, AuthHero now:
  1. Lists the tenant's enabled migration sources.
  2. For each, redeems the token at the upstream `/oauth/token` (`grant_type=refresh_token`) using the source's credentials.
  3. On success, calls `/userinfo` to learn the upstream `sub`.
  4. Resolves or lazily creates the local user via the standard `getOrCreateUserByProvider` path (running the existing user-registration hooks).
  5. Mints native AuthHero `access_token` / `id_token` / `refresh_token` and returns them.
  6. If every source rejects, falls back to the existing `invalid_grant`.

  The client keeps using `grant_type=refresh_token` — no SDK change. After one exchange per user, that user is fully on the AuthHero side.

  **New:**
  - `MigrationSource` adapter entity at the tenant level: `provider` (`auth0` | `cognito` | `okta` | `oidc`), `connection`, `enabled`, `credentials` (`domain` / `client_id` / `client_secret` / optional `audience` / `scope`).
  - `migrationSources?: MigrationSourcesAdapter` on `DataAdapters` (optional — adapters that don't implement it simply omit it; the re-mint flow becomes a no-op).
  - `MigrationProvider` interface (`exchangeRefreshToken`, `fetchUserInfo`) with an Auth0 implementation. Cognito/Okta/generic OIDC will be added in follow-ups.
  - `/api/v2/migration-sources` Management API (full CRUD); permissions `create|read|update|delete:migration_sources` are seeded automatically.
  - `client_secret` is redacted (`"***"`) on every management-API response.
  - Kysely migration `2026-05-14T10:00:00_migration_sources` adds the `migration_sources` table.

  **Out of scope (follow-ups):** bulk user import via the same provider abstraction, Cognito / Okta / generic OIDC providers, account-link / `identities[]` migration, react-admin UI.

### Patch Changes

- 52aba15: Tighten `/api/v2/stats/daily` and `/api/v2/stats/active-users` to match Auth0's semantics.

  **`logins` no longer over-counts.** All three stats adapters (kysely, drizzle, cloudflare/analytics-engine) now count only `s` (SUCCESS_LOGIN) as a login. Previously they also summed token exchanges (`seacft`, `seccft`, `sepft`, `sertft`) and silent auth (`ssa`), which inflated the figure substantially for SPAs that refresh tokens frequently. Auth0's daily-stats `logins` is just successful logins, so the numbers now line up.

  **`leaked_passwords` matches Auth0's definition.** Adapters now sum only `pwd_leak` (breached-password detection). The authhero-internal `signup_pwd_leak` and `reset_pwd_leak` variants are no longer included in this metric.

  **`/stats/active-users` only counts real logins.** Same narrowing — distinct users with a `SUCCESS_LOGIN` in the last 30 days, not distinct users who happened to exchange a refresh token.

  **Zero-fill in `/stats/daily`.** The route now returns one row per day in the requested range, including days with no events (Auth0 behavior). Previously consumers got gaps for empty days, breaking graphs that iterate the array sequentially.

- Updated dependencies [e9bef63]
- Updated dependencies [7c8668d]
  - @authhero/adapter-interfaces@2.1.0

## 11.0.0

### Major Changes

- 63bf3a9: Collapse the `strategy: "auth0"` source connection into the destination DB connection. The migration credentials now live on the same connection users land on — matching Auth0's Custom Database shape — and are read from `options.configuration` (`token_endpoint`, `userinfo_endpoint`, `client_id`, `client_secret`).

  **Breaking changes**
  - The `strategy: "auth0"` connection type is removed (`Strategy.AUTH0` is no longer exported from `@authhero/adapter-interfaces`). The DB connection's `options.configuration` block now carries the upstream credentials; `options.import_mode: true` on that same connection enables password capture from the upstream.
  - The refresh-token proxy to upstream Auth0 has been removed. Replacement via local re-mint is tracked in #833 — until that lands, upstream-issued refresh tokens are rejected and clients must re-authenticate.
  - The `Auth0ProxyResponse` error class and `proxyRefreshToken` helper are deleted.

  **Migration**

  A kysely migration runs automatically: for each tenant with exactly one `strategy: "auth0"` connection and exactly one `Username-Password-Authentication` connection, the upstream credentials are merged into the DB connection's `options.configuration` and the source row is deleted. Tenants with multiple DB connections are skipped and logged — operators must merge manually.

### Minor Changes

- 63bf3a9: Add `is_system` and `inherit` flags to actions so the control-plane tenant can publish shared action templates that other tenants opt into.
  - **`is_system: true`** on an action in the control-plane tenant marks it as a shared template.
  - **`inherit: true`** on a tenant's action makes it a stub: at execute time the code-hook loader reads `code` from the control-plane action whose `name` matches. The local row still owns per-tenant state (enabled/disabled bindings, secrets), and **local secrets override upstream by name** so customers can configure per-tenant credentials without forking the code.
  - Edits to the control-plane action propagate live to every inheriting tenant (read-through semantics; no copy-on-install).

  Linkage is by **name match** (tenant stub `name == control_plane.name && is_system`), which keeps the "manage by hand in the UI" workflow simple — the operator creates both rows with the same name. No seeder yet; that can come later once the patterns settle.

  Schema: two new integer columns on `actions` (`is_system`, `inherit`), backfilled to `0` so existing rows behave exactly as before. The drizzle adapter still has a stub actions adapter that throws — no schema change there.

  Runtime read-through requires `data.multiTenancyConfig.controlPlaneTenantId` to be set (it already is when adapters are wrapped via `withRuntimeFallback`). When unset, `inherit: true` falls back to the local `code` so single-tenant deployments don't break.

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

## 10.136.0

### Minor Changes

- 1ea694f: Add an Auth0-compatible **Actions Executions** API.
  - New `action_executions` storage entity and adapter (`get`, `create`).
  - New management API endpoint `GET /api/v2/actions/executions/:id` returning the Auth0-shape execution object (`id`, `trigger_id`, `status`, `results[]`, `created_at`, `updated_at`). See https://auth0.com/docs/api/management/v2/actions/get-execution.
  - Per-action console output is now captured and exposed via the AuthHero-specific endpoint `GET /api/v2/actions/executions/:id/logs` (Auth0 keeps these in a separate real-time logs stream rather than the executions API; we co-locate them so admins have one place to look).
  - New dry-run endpoint `POST /api/v2/actions/actions/:id/test` runs an action through the executor with a caller-supplied event payload and returns the result synchronously. Does not persist an execution or replay API calls.
  - The hook runtime now writes one execution record per trigger fire (post-login, credentials-exchange, pre-/post-user-registration), aggregating each action's result into the `results[]` array — matching Auth0's per-trigger semantics. Per-hook `sh`/`fh` log entries are no longer emitted from action paths; the credentials-exchange path stamps the resulting tenant log with `details.execution_id` so admins can navigate from a log entry to the execution detail.
  - React-admin: action edit page gets a "Test action" panel with per-trigger payload fixtures; the log detail view gets an "Action Execution" tab that resolves `details.execution_id` and shows per-action timings, errors, and captured console output.

  The internal trigger id `post-user-login` is normalized to Auth0's `post-login` when persisted in execution records.

  The Drizzle adapter ships an `actionExecutions` stub that throws — same pattern as the existing `actions` stub — since action storage is not yet implemented for Drizzle. Use the Kysely adapter when actions are needed.

- 1ea694f: Promote `disable_sign_ups` from `client_metadata` to a typed top-level `boolean` field on `Client`, and add a new `hide_sign_up_disabled_error` flag for enumeration-safe sign-up blocking.

  When `disable_sign_ups` is true and `hide_sign_up_disabled_error` is also true, the identifier screen no longer reveals that an email is unknown: it advances to the OTP/password challenge as if the account existed and fails generically at credential check. Skips OTP/magic-link delivery to unknown addresses in this stub path. Useful for tenants where email enumeration is a stronger concern than the UX cost of stranded users.

  Adds a migration that copies `client_metadata.disable_sign_ups = "true"` into the new column and removes the key from `client_metadata` so there is a single source of truth going forward. The legacy `client_metadata.disable_sign_ups` key is no longer read by the engine.

### Patch Changes

- 1ea694f: Hook dispatch now honors `priority` order. `hooks.list` returns rows ordered by `priority` desc with `created_at_ts` asc as tiebreaker, so the order configured in the Actions Triggers UI (and any other priority you set) determines the runtime execution order. Previously hooks ran in arbitrary DB order. Callers that pass an explicit `sort` keep that behavior.
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
  - @authhero/adapter-interfaces@1.19.0

## 10.135.0

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

## 10.134.0

### Minor Changes

- 0c662c0: Add deployment history for actions and fix the runtime lookup that prevented Auth0-style actions from firing.
  - The post-login (and other code-hook) dispatcher previously only resolved code via the legacy `data.hookCode` table. Actions created through the Auth0-compatible `POST /api/v2/actions/actions` API live in `data.actions` and were silently skipped at runtime. `handleCodeHook` now resolves `code_id` from `data.actions` first and falls back to `data.hookCode`, so deployed actions bound to a trigger actually run.
  - New `actionVersions` adapter (kysely + stub for drizzle) plus a `2026-05-10` migration creating the `action_versions` table. A version row is snapshotted on every action create and on every `POST /api/v2/actions/actions/:id/deploy`, with the latest snapshot marked `deployed: true` and any prior versions cleared.
  - New management API routes: `GET /api/v2/actions/actions/:actionId/versions`, `GET /api/v2/actions/actions/:actionId/versions/:id`, and `POST /api/v2/actions/actions/:actionId/versions/:id/deploy` (rollback). Rollback re-deploys the rolled-back version's code via the configured `codeExecutor` and snapshots a new version row so history reflects the rollback.
  - Deleting an action now also removes its version history.

### Patch Changes

- Updated dependencies [0c662c0]
  - @authhero/adapter-interfaces@1.17.0

## 10.133.0

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

- 45f719e: Add opt-in per-tenant signing keys with control-plane fallback.
  - `SigningKey` gains an optional `tenant_id` field. Existing rows (where `tenant_id IS NULL`) are treated as the shared control-plane bucket — no migration needed.
  - The kysely keys adapter now exposes `tenant_id` as a filterable lucene field (e.g. `q: "type:jwt_signing AND tenant_id:foo"`, or `-_exists_:tenant_id` for the control-plane bucket).
  - New `signingKeyMode` config in `init({ ... })` accepts `"control-plane" | "tenant"` or a resolver `({ tenant_id }) => …`. Mirrors the `userLinkingMode` pattern so tenants can be migrated one at a time. Default is `"control-plane"`, preserving the legacy behavior where every tenant shares one key pool.
  - When a tenant resolves to `"tenant"`, signing prefers the tenant's own key and falls back to the control-plane key if the tenant has no non-revoked key yet. JWKS for that tenant publishes the union of both buckets so tokens minted by either still verify during rollout.
  - The management API `GET /signing`, `POST /signing/rotate`, `PUT /signing/{kid}/revoke`, and `GET /signing/{kid}` now scope to the `tenant-id` header. Rotating with a tenant header revokes only that tenant's keys and mints the new key with `tenant_id` set; calls without the header continue to operate on the control-plane bucket.

  Transitional: once every tenant has its own key, `signingKeyMode`, the control-plane fallback, and the legacy `tenant_id IS NULL` bucket can be removed.

- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [45f719e]
  - @authhero/adapter-interfaces@1.16.0

## 10.132.4

### Patch Changes

- Updated dependencies [639ab29]
  - @authhero/adapter-interfaces@1.15.0

## 10.132.3

### Patch Changes

- Updated dependencies [85d1d06]
  - @authhero/adapter-interfaces@1.14.0

## 10.132.2

### Patch Changes

- Updated dependencies [e0cd449]
- Updated dependencies [86fe6e8]
- Updated dependencies [f41b85c]
- Updated dependencies [3891832]
  - @authhero/adapter-interfaces@1.13.0

## 10.132.1

### Patch Changes

- 32aacc6: Action secrets PATCH now preserves existing values when an incoming secret omits its `value` (matched by `name`). The `value` field is optional on writes so admin UIs can round-trip a masked secrets list without overwriting stored values.
- 32aacc6: Add `default_client_id` to the tenant schema. `/connect/start` now prefers this client as the login_session anchor for tenant-level DCR consent flows, falling back to the first available client so a brand-new tenant can still bootstrap its first integration. Roughly analogous to Auth0's "Default App" / Global Client.
- Updated dependencies [32aacc6]
- Updated dependencies [a4e29bd]
- Updated dependencies [32aacc6]
- Updated dependencies [6e5762c]
- Updated dependencies [32aacc6]
  - @authhero/adapter-interfaces@1.12.0

## 10.132.0

### Minor Changes

- 21b0608: Add Auth0-style refresh-token rotation and at-rest hashing.
  - New wire format `rt_<lookup>.<secret>`. The `lookup` slice is indexed in `refresh_tokens.token_lookup`; only the SHA-256 of the secret is persisted in `token_hash`. Internal ULID `id` stays as the primary key.
  - New per-client config in `Client.refresh_token`: `rotation_type: "rotating" | "non-rotating"` (default `non-rotating`) and `leeway` seconds (default 30). Set `rotation_type: "rotating"` to opt a client into rotation.
  - Each rotation issues a fresh child sharing `family_id` with the parent. Re-presenting a rotated parent within `leeway` mints a sibling (concurrent-call tolerance); outside `leeway` it triggers reuse detection and revokes the entire family via the new `revokeFamily` adapter method.
  - Admin `DELETE /api/v2/refresh_tokens/:id` now also revokes the rest of the family.
  - Backwards compatible: legacy id-only refresh tokens keep working until `2026-06-05`. After that date a follow-up PR removes the legacy fallback.

- ea5ec43: Add endpoints for organization connections
- 90e9906: Add `/api/v2/log-streams` and `/api/v2/attack-protection` management endpoints,
  and stop merging locale defaults into the GET response of
  `/api/v2/prompts/{prompt}/custom-text/{language}`. The terraform `auth0/auth0`
  provider can now drive log streams, attack-protection settings, and prompt
  custom text against authhero without the apply hanging on PUT/GET drift.

### Patch Changes

- Updated dependencies [21b0608]
- Updated dependencies [ea5ec43]
- Updated dependencies [90e9906]
  - @authhero/adapter-interfaces@1.11.0

## 10.131.5

### Patch Changes

- Updated dependencies [e5cbfe7]
- Updated dependencies [dd071e0]
  - @authhero/adapter-interfaces@1.10.3

## 10.131.4

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

## 10.131.3

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

## 10.131.2

### Patch Changes

- Updated dependencies [ba03e14]
  - @authhero/adapter-interfaces@1.10.0

## 10.131.1

### Patch Changes

- Updated dependencies [2578652]
  - @authhero/adapter-interfaces@1.9.0

## 10.131.0

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

- 48eab09: Add Phases 4 and 5 of RFC 7591/7592 Dynamic Client Registration.

  **Phase 4 — consent-mediated DCR**
  - New top-level `GET /connect/start?integration_type=...&domain=...&return_to=...&state=...&scope=...` route validates the request, creates a login session, and 302s to `/u2/connect/start`. The Stencil widget renders a consent screen there; on confirm AuthHero mints an IAT bound to the consenting user (with `domain`, `integration_type`, `scope`, and `grant_types: ["client_credentials"]` as pre-bound constraints) and redirects to `return_to?authhero_iat=<token>&state=<state>`. Cancel returns `authhero_error=cancelled`.
  - New `POST /api/v2/client-registration-tokens` (scope `create:client_registration_tokens` or `auth:write`) for non-browser IAT issuance. Body: `{ sub?, constraints?, expires_in_seconds?, single_use? }` — defaults to 5-minute TTL and single-use.
  - New tenant flag `dcr_allowed_integration_types: string[]` allowlists the `integration_type` values accepted by `/connect/start`.
  - New management scope `create:client_registration_tokens` added to `MANAGEMENT_API_SCOPES`.

  **Phase 5 — owner scoping & soft-delete enforcement**
  - New `GET /api/v2/users/{user_id}/connected-clients` Management API endpoint returns clients owned by a user (created via IAT-gated DCR). Response is a slim projection — no secrets, no internal config — and excludes soft-deleted clients.
  - `getEnrichedClient` now treats clients with `client_metadata.status === "deleted"` as not found. After RFC 7592 `DELETE /oidc/register/{client_id}`, subsequent `/oauth/token`, `/authorize`, and resume requests for that `client_id` are rejected.
  - The kysely `clients.list` adapter now supports lucene-style `field:"value"` exact-match filtering on `owner_user_id` and `registration_type`.

- ee8f683: Drop redundant tenant_id indexes flagged by PlanetScale (connections, invites, organizations, role_permissions, themes) and remove the unused `members` table. Each drop uses ifExists() so it is safe against already-cleaned environments.
- Updated dependencies [48eab09]
- Updated dependencies [02cebf4]
  - @authhero/adapter-interfaces@1.8.0

## 10.130.0

### Minor Changes

- 9145dbd: Drop the multi-statement transaction from `refreshTokens.update`. The previous implementation ran UPDATE + SELECT + UPDATE inside `db.transaction()` to extend the parent `login_session` expiry, which on async HTTP drivers (PlanetScale, D1) meant three sequential round-trips plus BEGIN/COMMIT and held a row lock on `login_sessions` across the whole transaction — creating a hot-row hotspot when multiple refresh tokens shared a `login_id`.
  - Add optional `UpdateRefreshTokenOptions.loginSessionBump` to the adapter interface. The caller now provides `login_id` and the pre-computed new `expires_at`, so the adapter avoids a read-before-write.
  - `refreshTokens.update` issues the refresh-token and login-session UPDATEs concurrently via `Promise.all`, collapsing wall-clock latency to roughly one round-trip on async drivers. The bump is idempotent (`WHERE expires_at_ts < new`) and self-healing (next refresh re-bumps on a transient failure), so strict atomicity is not required.
  - Fix `ctx.req.header["x-real-ip"]` / `["user-agent"]` — Hono exposes `header` as a function, so bracket access has been silently writing empty strings to `device.last_ip` / `device.last_user_agent` since the grant landed. Use `ctx.req.header("x-real-ip")` and skip the `device` write entirely when IP and UA are unchanged.

### Patch Changes

- Updated dependencies [9145dbd]
- Updated dependencies [9145dbd]
  - @authhero/adapter-interfaces@1.7.0

## 10.129.0

### Minor Changes

- 7d9f138: Soft-revoke refresh tokens instead of hard-deleting them. Adds a `revoked_at` field to the `RefreshToken` schema, a `revokeByLoginSession(tenant_id, login_session_id, revoked_at)` adapter method, and a `refresh_tokens.revoked_at_ts` column. The logout route now issues a single bulk UPDATE (fixing a pagination bug where sessions with >100 refresh tokens were not fully revoked), and the refresh-token grant rejects revoked tokens with an `invalid_grant` error.

### Patch Changes

- Updated dependencies [7d9f138]
  - @authhero/adapter-interfaces@1.6.0

## 10.128.1

### Patch Changes

- 0b3419b: Split the `login_sessions` authParams column cleanup into two migrations so the blob-only adapter code can be deployed ahead of the heavier column drop.

  `2026-04-20T12:00:00_drop_login_sessions_hoisted_authparams` is renamed to `2026-04-20T12:00:00_relax_login_sessions_authparams` and now only drops the `login_sessions_client_fk` foreign key and relaxes `NOT NULL` on `authParams_client_id` — two cheap `ALTER TABLE`s on MySQL. The actual column drop moves to a new `2026-04-21T10:00:00_drop_login_sessions_hoisted_authparams` migration, which can be scheduled independently.

  Run order is unchanged on a fresh database. For existing deployments, the split lets you roll out the previous authhero release (which stopped writing hoisted columns) even when the heavier drop hasn't run yet, as long as the relax migration has been applied.

## 10.128.0

### Minor Changes

- 31b0b62: Update the adapters

### Patch Changes

- f27884d: Move `login_sessions.authParams` entirely into the JSON blob column `auth_params` and drop the 18 legacy hoisted `authParams_*` columns.

  The backfill migration (`2026-04-20T11:00:00`) reconstructs `auth_params` from the hoisted columns for any row where it is still NULL, guaranteeing the blob is populated before the columns are removed. The follow-up migration (`2026-04-20T12:00:00`) then drops all 18 hoisted columns from `login_sessions` and removes the `login_sessions_client_fk` foreign key that referenced `authParams_client_id`. On MySQL this is a straightforward `DROP FOREIGN KEY` + `DROP COLUMN` sequence; on SQLite the table is recreated because SQLite rejects `DROP COLUMN` on FK-referenced columns.

  The adapter now writes and reads authParams exclusively via the JSON blob. DB-level referential integrity between `login_sessions` and `clients` is no longer enforced — the client_id lives inside the blob, which cannot be foreign-keyed. Adding a new field to `AuthParams` no longer requires a schema migration.

  The Drizzle/D1 adapter has been updated to match: `src/schema/sqlite/sessions.ts` now declares `auth_params` and drops the hoisted `authParams_*` columns, the login-sessions adapter reads/writes via the blob, and a new `drizzle/0004_login_sessions_auth_params_blob.sql` migration backfills and drops the hoisted columns. The AWS (DynamoDB) adapter already stored authParams as a JSON string, so no change was required there.

## 10.127.1

### Patch Changes

- a833d42: Store `login_sessions.authParams` as a JSON blob in a new `auth_params` column. The existing hoisted `authParams_*` columns are still populated on create (dual-write) and still read on get when the blob is NULL, so upgrade is backwards compatible and rows created before this release continue to read correctly via the fallback. Adding future AuthParams fields no longer requires a schema migration.

  Also widens `login_sessions.authorization_url` from `varchar(1024)` to `text` (MySQL only; SQLite ignores varchar constraints) so real authorize URLs with long scopes / PAR / id_token_hint fit.

  `loginSessions.update({ authParams })` now merges the incoming authParams into the stored blob (and the hoisted columns via the existing flatten path), so partial and full-object call patterns both keep the two representations in sync.

  Follow-up releases: a data-migration release will backfill `auth_params` for pre-existing rows, and a cleanup release will drop the redundant hoisted `authParams_*` columns and the adapter's fallback branch.

## 10.127.0

### Minor Changes

- 931f598: Add `GET /authorize/resume` endpoint mirroring Auth0's terminal login-session resumption point.

  Sub-flows now persist the authenticated identity onto the login session (new `auth_strategy` and `authenticated_at` columns on `login_sessions`) and 302 the browser to `/authorize/resume?state=…`. The resume endpoint owns (a) hopping back to the original authorization host when the browser is on the wrong custom domain so the session cookie lands under the right wildcard, and (b) dispatching based on the login-session state machine to the final token/code issuance or to the next MFA/continuation screen.

  The social OAuth callback is migrated as the first consumer: the old 307-POST cross-domain re-dispatch in `connectionCallback` is replaced by a plain 302 to `/authorize/resume`, and the OAuth code exchange now always runs once on whichever host the provider called back to. Subsequent PRs will migrate the password / OTP / signup / SAML sub-flows to the same pattern, after which the ad-hoc `Set-Cookie` forwarding layers in Universal Login can be removed.

### Patch Changes

- Updated dependencies [931f598]
  - @authhero/adapter-interfaces@1.5.0

## 10.126.1

### Patch Changes

- 6503423: Fix cleanup deleting `login_sessions` while child `refresh_tokens` are still valid.

  `refreshTokens.create` and `refreshTokens.update` now extend the parent
  `login_sessions.expires_at_ts` to match the refresh token's longest expiry, in
  the same DB transaction. Previously the initial token exchange never bumped
  the login_session, so cleanup could delete the parent while its refresh tokens
  were still valid.

## 10.126.0

### Minor Changes

- b5f73bb: Add drain outbox

### Patch Changes

- Updated dependencies [1d15292]
  - @authhero/adapter-interfaces@1.4.1

## 10.125.0

### Minor Changes

- d288b62: Add support for dynamic workers

## 10.124.0

### Minor Changes

- d84cb2f: Complete the transaction fixes

### Patch Changes

- Updated dependencies [d84cb2f]
  - @authhero/adapter-interfaces@1.4.0

## 10.123.0

### Minor Changes

- 2f6354d: Make session lifetime cofigurable

### Patch Changes

- Updated dependencies [2f6354d]
  - @authhero/adapter-interfaces@1.3.0

## 10.122.0

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

## 10.121.1

### Patch Changes

- Updated dependencies [3da602c]
  - @authhero/adapter-interfaces@1.1.0

## 10.121.0

### Minor Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

### Patch Changes

- Updated dependencies [20d5140]
  - @authhero/adapter-interfaces@1.0.0

## 10.120.0

### Minor Changes

- a59a49b: Implement disable-sso

### Patch Changes

- Updated dependencies [a59a49b]
  - @authhero/adapter-interfaces@0.155.0

## 10.119.0

### Minor Changes

- fa7ce07: Updates for passkeys login

### Patch Changes

- Updated dependencies [fa7ce07]
  - @authhero/adapter-interfaces@0.154.0

## 10.118.0

### Minor Changes

- 77b7c76: Add outbox middleware

## 10.117.0

### Minor Changes

- 884e950: Update outbox

### Patch Changes

- Updated dependencies [884e950]
  - @authhero/adapter-interfaces@0.153.0

## 10.116.0

### Minor Changes

- 2f65572: Fix nested transactions
- 76f2b7f: Fix paging of clients in react-admin

## 10.115.0

### Minor Changes

- f3b910c: Add outbox pattern

### Patch Changes

- Updated dependencies [f3b910c]
  - @authhero/adapter-interfaces@0.152.0

## 10.114.0

### Minor Changes

- 3e74dea: Update handling of host headers
- 022f12f: Move email and sms to adapters

### Patch Changes

- Updated dependencies [3e74dea]
- Updated dependencies [022f12f]
  - @authhero/adapter-interfaces@0.151.0

## 10.113.0

### Minor Changes

- 164fe2c: Added passkeys

### Patch Changes

- Updated dependencies [164fe2c]
  - @authhero/adapter-interfaces@0.150.0

## 10.112.0

### Minor Changes

- b3ad21f: Update setup with new ui

## 10.111.0

### Minor Changes

- c862e9f: Add footer to u2 routes and fix docker build

## 10.110.0

### Minor Changes

- f4557c1: Fix the topt enrollment

## 10.109.0

### Minor Changes

- d9c2ad1: Fixes to mfa-signup and new account screens

## 10.108.0

### Minor Changes

- 64e858a: Add mfa with logging

### Patch Changes

- Updated dependencies [64e858a]
  - @authhero/adapter-interfaces@0.149.0

## 10.107.1

### Patch Changes

- Updated dependencies [469c395]
  - @authhero/adapter-interfaces@0.148.0

## 10.107.0

### Minor Changes

- 5e73f56: Remove magic strings
- 5e73f56: Replace magic strings

### Patch Changes

- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
  - @authhero/adapter-interfaces@0.147.0

## 10.106.2

### Patch Changes

- Updated dependencies [318fcf9]
- Updated dependencies [318fcf9]
  - @authhero/adapter-interfaces@0.146.0

## 10.106.1

### Patch Changes

- Updated dependencies [30b5be1]
  - @authhero/adapter-interfaces@0.145.0

## 10.106.0

### Minor Changes

- dcbd1d7: Store the used connection on the login_session

### Patch Changes

- Updated dependencies [dcbd1d7]
  - @authhero/adapter-interfaces@0.144.0

## 10.105.1

### Patch Changes

- Updated dependencies [39df1aa]
  - @authhero/adapter-interfaces@0.143.0

## 10.105.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

### Patch Changes

- Updated dependencies [1a72b93]
  - @authhero/adapter-interfaces@0.142.0

## 10.104.0

### Minor Changes

- c65565c: Fix bug with removing sessions in cleanup
- 3de697d: Add support for http validation of domains

### Patch Changes

- Updated dependencies [3de697d]
  - @authhero/adapter-interfaces@0.141.0

## 10.103.0

### Minor Changes

- c7c8770: Update expire_at_ts for login_sesssions
- 38d5be2: Update login_sessions expire

## 10.102.0

### Minor Changes

- 7154fe1: Update refresh-tokens schema

### Patch Changes

- Updated dependencies [7154fe1]
  - @authhero/adapter-interfaces@0.140.0

## 10.101.1

### Patch Changes

- Updated dependencies [2617efb]
  - @authhero/adapter-interfaces@0.139.0

## 10.101.0

### Minor Changes

- 35691f6: Set custom domain metadata

## 10.100.0

### Minor Changes

- 192f480: First step in refresh tokens refactor

### Patch Changes

- Updated dependencies [192f480]
  - @authhero/adapter-interfaces@0.138.0

## 10.99.0

### Minor Changes

- 6476145: Use username from linked identities

## 10.98.0

### Minor Changes

- 0719de4: Add username to indetifier array

### Patch Changes

- Updated dependencies [0719de4]
  - @authhero/adapter-interfaces@0.137.0

## 10.97.0

### Minor Changes

- d7bcd19: Add hook templates

### Patch Changes

- Updated dependencies [d7bcd19]
  - @authhero/adapter-interfaces@0.136.0

## 10.96.1

### Patch Changes

- Updated dependencies [65321b7]
  - @authhero/adapter-interfaces@0.135.0

## 10.96.0

### Minor Changes

- a5c1ba9: Add mfa signup

### Patch Changes

- Updated dependencies [a5c1ba9]
  - @authhero/adapter-interfaces@0.134.0

## 10.95.1

### Patch Changes

- Updated dependencies [7adc7dc]
  - @authhero/adapter-interfaces@0.133.0

## 10.95.0

### Minor Changes

- cd5fdc4: Update the routing for widget

## 10.94.1

### Patch Changes

- Updated dependencies [131ea43]
  - @authhero/adapter-interfaces@0.132.0

## 10.94.0

### Minor Changes

- c5935bd: Update the new widget endpoints

### Patch Changes

- Updated dependencies [c5935bd]
  - @authhero/adapter-interfaces@0.131.0

## 10.93.0

### Minor Changes

- ac8af37: Add custom text support

### Patch Changes

- Updated dependencies [ac8af37]
  - @authhero/adapter-interfaces@0.130.0

## 10.92.0

### Minor Changes

- 3b4445f: Handle conversion of is_system

## 10.91.0

### Minor Changes

- a8e70e6: Update schemas to remove old fallbacks

### Patch Changes

- Updated dependencies [a8e70e6]
  - @authhero/adapter-interfaces@0.129.0

## 10.90.0

### Minor Changes

- e7f5ce5: Fix the universal-login-template in kysley

## 10.89.0

### Minor Changes

- 6585906: Move universal login templates to separate adapter

### Patch Changes

- Updated dependencies [6585906]
  - @authhero/adapter-interfaces@0.128.0

## 10.88.0

### Minor Changes

- fd374a9: Set theme id
- 8150432: Replaced legacy client

### Patch Changes

- Updated dependencies [fd374a9]
- Updated dependencies [8150432]
  - @authhero/adapter-interfaces@0.127.0

## 10.87.1

### Patch Changes

- Updated dependencies [154993d]
  - @authhero/adapter-interfaces@0.126.0

## 10.87.0

### Minor Changes

- 491842a: Bump packages to make sure the universal_login_templates is available

### Patch Changes

- Updated dependencies [491842a]
  - @authhero/adapter-interfaces@0.125.0

## 10.86.0

### Minor Changes

- 2af900c: Create a per user session cleanup
- 2be02f8: Add dynamic liquid templates
- 2af900c: Update guids to ulids

### Patch Changes

- Updated dependencies [2af900c]
- Updated dependencies [2be02f8]
  - @authhero/adapter-interfaces@0.124.0

## 10.85.0

### Minor Changes

- 2d0a7f4: Add a auth0-conformance flag

### Patch Changes

- Updated dependencies [2d0a7f4]
  - @authhero/adapter-interfaces@0.123.0

## 10.84.0

### Minor Changes

- 49039c0: Add profile data for primary user in indentities

## 10.83.0

### Minor Changes

- 76510cd: Fixes for branding page and endpoint

## 10.82.0

### Minor Changes

- 846a92c: Split the migrations

## 10.81.0

### Minor Changes

- 168b585: Update the schemas for the sessions

## 10.80.1

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0

## 10.80.0

### Minor Changes

- 2853db0: Only show the selected connections for a client
- 967d470: Add a metadata field to roles and resource-servers

### Patch Changes

- Updated dependencies [2853db0]
- Updated dependencies [967d470]
  - @authhero/adapter-interfaces@0.121.0

## 10.79.0

### Minor Changes

- 00d2f83: Update versions to get latest build

### Patch Changes

- Updated dependencies [00d2f83]
  - @authhero/adapter-interfaces@0.120.0

## 10.78.0

### Minor Changes

- 8ab8c0b: Start adding xstate

### Patch Changes

- Updated dependencies [8ab8c0b]
  - @authhero/adapter-interfaces@0.119.0

## 10.77.0

### Minor Changes

- 3d3fcc0: Migrate connections

## 10.76.2

### Patch Changes

- Updated dependencies [b7bb663]
  - @authhero/adapter-interfaces@0.118.0

## 10.76.1

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0

## 10.76.0

### Minor Changes

- 9c15354: Remove shadcn and updated widget

### Patch Changes

- Updated dependencies [9c15354]
  - @authhero/adapter-interfaces@0.116.0

## 10.75.0

### Minor Changes

- f738edf: Add checkpoint pagination for organizations

### Patch Changes

- Updated dependencies [f738edf]
  - @authhero/adapter-interfaces@0.115.0

## 10.74.0

### Minor Changes

- 17d73eb: Change name of organization flag and add OR support in lucence queries

### Patch Changes

- Updated dependencies [17d73eb]
- Updated dependencies [e542773]
  - @authhero/adapter-interfaces@0.114.0

## 10.73.1

### Patch Changes

- Updated dependencies [d967833]
  - @authhero/adapter-interfaces@0.113.0

## 10.73.0

### Minor Changes

- 0f8e4e8: Change from main to control plane
- 3a180df: Fix organization names for main tenant

## 10.72.0

### Minor Changes

- 1c36752: Use org tokens for tenants in admin

## 10.71.0

### Minor Changes

- ae8553a: Add is_system to all adapters

### Patch Changes

- Updated dependencies [ae8553a]
  - @authhero/adapter-interfaces@0.112.0

## 10.70.0

### Minor Changes

- 100b1bd: Patch the redirect action for flows

## 10.69.0

### Minor Changes

- 02567cd: Make create authhero work with d1 locally

### Patch Changes

- Updated dependencies [906337d]
  - @authhero/adapter-interfaces@0.111.0

## 10.68.0

### Minor Changes

- a108525: Add flows

### Patch Changes

- Updated dependencies [a108525]
  - @authhero/adapter-interfaces@0.110.0

## 10.67.0

### Minor Changes

- 1bec131: Add stats endpoints and activity view

### Patch Changes

- Updated dependencies [1bec131]
  - @authhero/adapter-interfaces@0.109.0

## 10.66.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

## 10.65.2

### Patch Changes

- Updated dependencies [0e906aa]
  - @authhero/adapter-interfaces@0.108.0

## 10.65.1

### Patch Changes

- Updated dependencies [212f5c6]
  - @authhero/adapter-interfaces@0.107.0

## 10.65.0

### Minor Changes

- 5ed04e5: Limit the useragent to 256 to fit in the table

## 10.64.1

### Patch Changes

- Updated dependencies [f37644f]
  - @authhero/adapter-interfaces@0.106.0

## 10.64.0

### Minor Changes

- 40caf1a: Add support for different connections for different clients. And support sorting.

### Patch Changes

- Updated dependencies [40caf1a]
  - @authhero/adapter-interfaces@0.105.0

## 10.63.1

### Patch Changes

- Updated dependencies [125dbb9]
  - @authhero/adapter-interfaces@0.104.0

## 10.63.0

### Minor Changes

- c96d83b: Added dispaly name on connections

### Patch Changes

- Updated dependencies [b0c4421]
- Updated dependencies [c96d83b]
  - @authhero/adapter-interfaces@0.103.0

## 10.62.0

### Minor Changes

- 65db836: Update logging to kysely

## 10.61.0

### Minor Changes

- 731c191: Fix paging issues with custom domains

## 10.60.0

### Minor Changes

- 0566155: Remove country 3 and country name fields

### Patch Changes

- Updated dependencies [0566155]
- Updated dependencies [0566155]
  - @authhero/adapter-interfaces@0.102.0

## 10.59.0

### Minor Changes

- 84f7b60: Change id of passwords to use nanoid

## 10.58.0

### Minor Changes

- 0ffb5ca: Add support for password strength

### Patch Changes

- Updated dependencies [0ffb5ca]
  - @authhero/adapter-interfaces@0.101.0

## 10.57.0

### Minor Changes

- 3a0d8ee: Add geo info

### Patch Changes

- Updated dependencies [3a0d8ee]
  - @authhero/adapter-interfaces@0.100.0

## 10.56.0

### Minor Changes

- a3c69f0: Add support for logs with cloudflare sql

### Patch Changes

- Updated dependencies [a3c69f0]
  - @authhero/adapter-interfaces@0.99.0

## 10.55.1

### Patch Changes

- 6067f00: Update the hook names
- Updated dependencies [6067f00]
  - @authhero/adapter-interfaces@0.98.0

## 10.55.0

### Minor Changes

- Update the logs schemas

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.97.0

## 10.54.0

### Minor Changes

- Added invites

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.96.0

## 10.53.0

### Minor Changes

- Refactor the client adapter

## 10.52.0

### Minor Changes

- Merge settings and tenants table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.95.0

## 10.51.0

### Minor Changes

- Add settings endpoint

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.94.0

## 10.50.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.93.0

## 10.50.0

### Minor Changes

- Improve logging

## 10.49.0

### Minor Changes

- Remove disable signup from legacy client

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.92.0

## 10.48.0

### Minor Changes

- Update tenant-id header handling

## 10.47.0

### Minor Changes

- Fix options for resource servers

## 10.46.0

### Minor Changes

- Update ids to match auth0 entity ids

## 10.45.0

### Minor Changes

- 149ab91: Drop the old application table
- b0e9595: Add client grants

### Patch Changes

- Updated dependencies [149ab91]
- Updated dependencies [b0e9595]
  - @authhero/adapter-interfaces@0.91.0

## 10.44.0

### Minor Changes

- Fix issues with lucene filter

## 10.43.0

### Minor Changes

- Update to use new clients

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.90.0

## 10.42.0

### Minor Changes

- Create new clients table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.89.0

## 10.41.0

### Minor Changes

- Changed to LegacyClient as a first step in the refactor

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.88.0

## 10.40.0

### Minor Changes

- Get organizations crud working like auth0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.87.0

## 10.39.0

### Minor Changes

- Add users to organizations

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.86.0

## 10.38.0

### Minor Changes

- Added organizations

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.85.0

## 10.37.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.84.0

## 10.37.0

### Minor Changes

- Add type to keys

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.83.0

## 10.36.0

### Minor Changes

- Add user roles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.82.0

## 10.35.0

### Minor Changes

- Add user permissions

## 10.34.0

### Minor Changes

- fc8153d: Update structure and endpoints

### Patch Changes

- Updated dependencies [fc8153d]
  - @authhero/adapter-interfaces@0.81.0

## 10.33.0

### Minor Changes

- Add roles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.80.0

## 10.32.0

### Minor Changes

- Update the casing for the migratinos

## 10.31.0

### Minor Changes

- Add resource servers, rules and permissions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.79.0

## 10.30.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.78.0

## 10.29.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.77.0

## 10.28.0

### Minor Changes

- Update the themes entity

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.76.0

## 10.27.0

### Minor Changes

- Add themes endpoints

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.75.0

## 10.26.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.74.0

## 10.25.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.73.0

## 10.24.0

### Minor Changes

- Update the cleanup script

## 10.23.0

### Minor Changes

- Updated packages and added danish

## 10.22.0

### Minor Changes

- Use normaized user to handle sms login

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.72.0

## 10.21.0

### Minor Changes

- Fetch expired login sessions

## 10.20.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.71.0

## 10.19.0

### Minor Changes

- Added state and nonce to codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.70.0

## 10.19.0

### Minor Changes

- Add redirect_uri to codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.69.0

## 10.18.0

### Minor Changes

- Add code_challenge to codes table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.68.0

## 10.17.0

### Minor Changes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.67.0

## 10.16.0

### Minor Changes

- Add a login_completed flag to the login sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.66.0

## 10.15.0

### Minor Changes

- Add a form_id property to hooks

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.65.0

## 10.14.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.64.0

## 10.13.0

### Minor Changes

- Update forms schema

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.63.0

## 10.12.0

### Minor Changes

- Update the forms fileds

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.62.0

## 10.11.0

### Minor Changes

- Add forms

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.61.0

## 10.10.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.60.0

## 10.9.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.59.0

## 10.8.0

### Minor Changes

- Create sms users

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.58.0

## 10.7.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.57.0

## 10.7.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.56.0

## 10.6.0

### Minor Changes

- Add a getByDomain function for cutsom domains and a tenant-id middleware

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.55.0

## 10.5.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.54.0

## 10.4.0

### Minor Changes

- Create a migration to make the id column for custom domains longer

## 10.3.0

### Minor Changes

- Update cleanup script

## 10.2.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.53.0

## 10.1.0

### Minor Changes

- fbc3a6c: Add a cleanup script

## 10.0.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.52.0

## 9.9.0

### Minor Changes

- Limit the length of the authorization_url to the size of the column

## 9.8.0

### Minor Changes

- Migrate last pages

## 9.7.0

### Minor Changes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.51.0

## 9.6.0

### Minor Changes

- Create migrations for new login sessions

## 9.5.0

### Minor Changes

- Add an optional session refrence to login_sessions and cleanup old tables

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.50.0

## 9.4.0

### Minor Changes

- Hande idle_expires_at in silent auth

## 0.10.0

### Minor Changes

- Bump kysely version

## 9.3.0

### Minor Changes

### Patch Changes

- Updated dependencies [a9959ad]
  - @authhero/adapter-interfaces@0.49.0

## 9.2.0

### Minor Changes

- Add a cloudflare adapter

## 9.1.0

### Minor Changes

- Get passwords can return null

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.48.0

## 9.0.0

### Minor Changes

- Add custom domains table and adapter

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.47.0

## 8.3.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.46.0

## 8.2.0

### Minor Changes

- Create temporary tables

## 8.1.0

### Minor Changes

- Update entities for sessions and refresh tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.45.0

## 8.0.0

### Minor Changes

- Recreate the tables for sessions and refresh tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.44.0

## 6.1.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.43.0

## 6.0.0

### Minor Changes

- Update session entity

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.42.0

## 5.1.0

### Minor Changes

- Add refresh token grant support

## 5.0.0

### Patch Changes

- Updated dependencies [23c2899]
  - @authhero/adapter-interfaces@0.41.0

## 4.0.0

### Minor Changes

- Add refresh tokens to jwt

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.40.0

## 3.0.0

### Minor Changes

- Store refresh tokesn

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.39.0

## 2.1.0

### Minor Changes

- Add the refersh tokens to the datbase model

## 2.0.0

### Minor Changes

- Add table for refresh tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.38.0

## 1.0.0

### Minor Changes

- Optimized bundles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.37.0

## 0.28.1

### Patch Changes

- Remove list params where not needed

## 0.28.0

### Minor Changes

- use default listparams

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.36.0

## 0.27.0

### Minor Changes

- fix json format for connection options

## 0.26.1

### Patch Changes

- Updated dependencies
- Updated dependencies [a0a18c9]
  - @authhero/adapter-interfaces@0.35.0

## 0.26.0

### Minor Changes

- Set the login count to 0

## 0.25.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.34.0

## 0.25.3

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.33.0

## 0.25.2

### Patch Changes

- update all build packages
- Updated dependencies
  - @authhero/adapter-interfaces@0.32.1

## 0.25.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.32.0

## 0.25.0

### Minor Changes

- set used_at for codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.31.0

## 0.24.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.30.0

## 0.24.3

### Patch Changes

- Updated dependencies [fbc0e55]
  - @authhero/adapter-interfaces@0.29.1

## 0.24.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.29.0

## 0.24.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.28.0

## 0.24.0

### Minor Changes

- 14794b6: support id-tokens
- moved token types from the interfaces to the authhero package

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.27.0

## 0.23.0

### Minor Changes

- add ip to logins table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.26.0

## 0.22.0

### Minor Changes

- added email providers and removed tickets
- Added email providers

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.25.0

## 0.21.0

### Minor Changes

- add code verifier to codes table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.24.0

## 0.20.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.23.0

## 0.20.0

### Minor Changes

- do not pass interfaces as peer dependency

## 0.19.0

### Minor Changes

- pass the interfaces as a peer dependency

## 0.18.1

### Patch Changes

- remove the iife build files
- Updated dependencies
  - @authhero/adapter-interfaces@0.22.1

## 0.18.0

### Minor Changes

- Get the demo project rendering

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.22.0

## 0.17.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.21.0

## 0.17.0

### Minor Changes

- Add the keys endpoints

## 0.16.0

### Minor Changes

- Store hook booleans as integers

## 0.15.0

### Minor Changes

- 26e2ef9: Fixed the connection tests and handle include_totals correctly

## 0.14.0

### Minor Changes

- a4b587d: Added the connection routes

## 0.13.4

### Patch Changes

- Expose the migration script for kysely and add authhero test
- Updated dependencies
  - @authhero/adapter-interfaces@0.20.3

## 0.13.3

### Patch Changes

- Update packages
- Updated dependencies
  - @authhero/adapter-interfaces@0.20.2

## 0.13.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.20.1

## 0.13.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.20.0

## 0.13.0

### Minor Changes

- Handle patch for app_metadata and user_metadata

## 0.12.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.19.0

## 0.12.0

### Minor Changes

- Expose app_metadata and user_metadata

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.18.0

## 0.11.2

### Patch Changes

- Add json parsing of connection options in the get client

## 0.11.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.17.1

## 0.11.0

### Minor Changes

- Change to use a json field for connection options

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.17.0

## 0.10.0

### Minor Changes

- Remove old properties of connections

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.16.0

## 0.9.7

### Patch Changes

- Change the allowed_clients on the application to be string in kysely and array of strings in interfaces
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.6

## 0.9.6

### Patch Changes

- Convert booleans to integers

## 0.9.5

### Patch Changes

- Changed so promptsetting uses a partial for the update
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.5

## 0.9.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.4

## 0.9.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.3

## 0.9.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.2

## 0.9.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.1

## 0.9.0

### Minor Changes

- Update kysely adapter for connection

### Patch Changes

- Add promptestting addapter
- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.0

## 0.8.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.14.0

## 0.8.0

### Minor Changes

- Remove the certificate type and add new update method

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.13.0

## 0.7.14

### Patch Changes

- Updated kysely for signing keys
- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.12.0

## 0.7.13

### Patch Changes

- Remove the otp table
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.9

## 0.7.12

### Patch Changes

- Removed unused tables
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.8

## 0.7.11

### Patch Changes

- Filter on tenant_id if avaialble
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.7

## 0.7.10

### Patch Changes

- Rebuild the kysely adapter
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.6

## 0.7.9

### Patch Changes

- Added a connection_id property to the codes
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.5

## 0.7.8

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.4

## 0.7.7

### Patch Changes

- Add husky to create builds on commit

## 0.7.6

### Patch Changes

- Fix typo in application get kysely adapter

## 0.7.5

### Patch Changes

- Simplify client
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.3

## 0.7.4

### Patch Changes

- Refactor applications and clients
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.2

## 0.7.3

### Patch Changes

- New build of kysely

## 0.7.2

### Patch Changes

- Handle empty allowed strings

## 0.7.1

### Patch Changes

- Update the application types
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.1

## 0.7.0

### Minor Changes

- Add the addons property

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.0

## 0.6.11

### Patch Changes

- Trim the logs description when writing a new entry
- Update the lucene filters to handle comparisons

## 0.6.10

### Patch Changes

- Fix the id column for logins

## 0.6.9

### Patch Changes

- 12d5d9f: Skip recursion for unflatten

## 0.6.8

### Patch Changes

- Fix the flatten helper and remove nulls from logins

## 0.6.7

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.5

## 0.6.6

### Patch Changes

- Build kysely adapter

## 0.6.5

### Patch Changes

- Add the redirect_uri to the authparmas for the authentication codes"

## 0.6.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.4

## 0.6.3

### Patch Changes

- Handle boolean values
- Updated dependencies
  - @authhero/adapter-interfaces@0.10.3

## 0.6.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.2

## 0.6.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.1

## 0.6.0

### Minor Changes

- Fixed issue with incorrect id in logins table

## 0.5.5

### Patch Changes

- Updated the types for logins and fixed the packaging for authhero
- Updated dependencies
  - @authhero/adapter-interfaces@0.10.0

## 0.5.4

### Patch Changes

- Fix plural on the logins adapter
- Updated dependencies
  - @authhero/adapter-interfaces@0.9.2

## 0.5.3

### Patch Changes

- Exported the login adapter.

## 0.5.2

### Patch Changes

- Centralized all codes to the codes table and added a new logins table for the login sessions. The old tables will be removed in the next update
- Updated dependencies
  - @authhero/adapter-interfaces@0.9.1

## 0.5.1

### Patch Changes

- Export themes adapter

## 0.5.0

### Minor Changes

- Added themes and changed primary key for sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.9.0

## 0.4.3

### Patch Changes

- Did a new build for the kysely adapter

## 0.4.2

### Patch Changes

- Fixed updates for applications

## 0.4.1

### Patch Changes

- Return null if a client isn't found

## 0.4.0

### Minor Changes

- Moved bcrypt out of adapter

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.8.0

## 0.3.0

### Minor Changes

- Updated the builds and d.ts files

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.7.0

## 0.2.0

### Minor Changes

- Added a package for kysely

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.6.0
