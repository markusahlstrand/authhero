# @authhero/adapter-interfaces

## 3.1.0

### Minor Changes

- 429f88a: Tighten PATCH `/api/v2/custom-domains/{id}` to match Auth0: only `tls_policy`, `custom_client_ip_header`, and `domain_metadata` (the authhero extension) are accepted. Previously the route accepted a partial of the full schema, which made round-trips (GET → modify → PATCH) fail with `Payload validation error` once clients sent immutable fields like `custom_domain_id`, `domain`, `primary`, `status`, `type`, etc. Adds an exported `customDomainUpdateSchema` for clients to bind to.

## 3.0.0

### Major Changes

- 3482bd3: Split the `microsoft` strategy into Auth0's two canonical strategies:
  `windowslive` (Microsoft Account / consumer) and `waad` (Azure AD / enterprise).
  `Strategy.MICROSOFT` is removed from the enum.

  Both strategies share the same Microsoft Identity Platform v2.0 OAuth handler
  internally but register under distinct strategy names so user_ids match Auth0's
  wire format: `windowslive|<sub>` for consumer logins, `waad|<oid>` for
  enterprise. `getProviderFromConnection` now always returns the strategy name —
  previously enterprise strategies (`oidc`, `samlp`, `waad`, `adfs`, `oauth2`)
  returned the connection name, which diverged from Auth0's
  `<strategy>|<conn>|<sub>` user_id format.

  **Breaking**: existing connection rows with `strategy = 'microsoft'` and any
  users with `<connection-name>|...` ids on enterprise connections will need a
  one-time DB migration.

### Minor Changes

- 8b8b117: Add `okta` as a first-class enterprise strategy. Okta connections use the
  shared OIDC handler internally but register under the `okta` strategy name so
  user_ids match Auth0's wire format (`okta|<sub>`). Required for migrations
  from Auth0 tenants that have Okta enterprise connections — without this the
  connection couldn't be created and `getStrategy` would throw `Strategy okta
not found` at login.

## 2.13.1

### Patch Changes

- d45a6b6: Loosen `audience`, `sender_email`, and `sender_name` to optional on `tenantInsertSchema` and `CreateTenantParams`. The admin UI tenant-create form now only asks for `id` and `friendly_name` plus the deployment fields; the omitted fields can be set later via tenant settings. Matches Auth0's model where tenant-level audience isn't required (per-token `aud` comes from resource servers / client grants). The legacy service-token path still errors clearly if it's asked to mint a token for a tenant without an `audience`.

## 2.13.0

### Minor Changes

- 7a0606f: Add tenant deployment / provisioning fields (`deployment_type`, `provisioning_state`, `bundle_configuration`, `worker_version`, `worker_script_name`, `storage_kind`, `d1_database_id`, plus `provisioning_error` and `provisioning_state_changed_at`). Existing tenants default to `shared` / `ready` via DB-level defaults; no behavior change.

  Adds a `TenantProvisioner` adapter interface (`packages/authhero/src/provisioning`) and a `NoopTenantProvisioner` implementation, exposed via `AuthHeroConfig.provisioner`. Lays the groundwork for provisioning per-tenant Cloudflare Workers from the control-plane API; the noop is correct for `shared` tenants and stands in until the WFP provisioner is wired in.

## 2.12.0

### Minor Changes

- 64e5f01: Add support for the RFC 8693 token-exchange grant (`urn:ietf:params:oauth:grant-type:token-exchange`) at `/oauth/token`. Lets a confidential client exchange a self-issued access token for a new access token scoped to a different organization (and optionally downscoped). The new token records the acting client in the RFC 8693 `act` claim for audit.

  The exchange enforces, in order:
  - Client authentication (`client_secret` or `client_assertion`). Public clients are rejected.
  - The exchanging client's `organization_usage` must not be `deny` (the default for new/DCR'd clients), so token-exchange is opt-in per client.
  - The client's `grant_types` allowlist must include the token-exchange grant (existing OAuth check).
  - The `subject_token` must be a JWT issued by this server (verified against the tenant JWKS), unexpired, and not already carrying an `act` claim (no re-exchange).
  - The target `organization` must exist and the user must be a member — or hold the global `admin:organizations` permission on the target resource server when the tenant has `inherit_global_permissions_in_organizations` enabled (same bypass the refresh-token grant uses).
  - Requested `scope` must be a subset of the subject token's scopes (downscope only).

  Only `subject_token_type=urn:ietf:params:oauth:token-type:access_token` is accepted today. Foreign token types would require a per-tenant registration flow and are not in scope.

  Adds `GrantType.TokenExchange` and `LogTypes.SUCCESS_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN` / `FAILED_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN` to `@authhero/adapter-interfaces`.

## 2.11.0

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

## 2.10.0

### Minor Changes

- 3bef633: Add custom domain certificate upload (PEM) for adapters that can terminate TLS at the edge.
  - `@authhero/adapter-interfaces`: new `customDomainCertificateUploadSchema` (`{ certificate, private_key }` PEM-validated) and an optional `uploadCertificate(tenant_id, id, cert)` method on `CustomDomainsAdapter`.
  - `@authhero/cloudflare-adapter`: implements `uploadCertificate`, forwarding `custom_certificate` and `custom_key` to Cloudflare's Custom Hostnames API (BYOC). Cert and key are not persisted by authhero.
  - `authhero`: new `PUT /custom-domains/{id}/certificate` management-api route, scoped to `update:custom_domains`. Returns 501 if the configured adapter doesn't implement `uploadCertificate`.

  This is an authhero extension beyond Auth0's API surface — Auth0's `self_managed_certs` mode requires customers to run their own reverse proxy. Here we let the Cloudflare edge terminate TLS with a customer-supplied cert.

## 2.9.1

### Patch Changes

- 1fb1bd1: Security hardening across the auth-api token paths. Defaults stay Auth0-faithful; stricter behavior is opt-in.
  - **authorization_code grant**: removed the `DEFAULT_CLIENT` secret fallback in `/oauth/token`. Anyone holding that one secret could previously substitute it for any other client's `client_secret` when exchanging a code. The "temporary" cross-tenant workaround is gone — cross-tenant scenarios must be modeled explicitly.
  - **authorization_code grant**: the code is now bound to the client it was issued to (RFC 6749 §10.5 / OIDC Core §3.1.3.2). Exchanging a code with a different `client_id` than the one that initiated `/authorize` is rejected with `invalid_grant`. Status code follows the existing `client.auth0_conformant` pattern from `refresh-token.ts` — `403` by default (Auth0 behavior), `400` when `auth0_conformant === false` (RFC behavior).
  - **authorization_code grant**: aligned the existing code-reuse rejection on the same `auth0_conformant` gate. Previously returned `400 invalid_grant` unconditionally; now `403` by default (matching Auth0) and `400` only when the client opts out.
  - **passwordless OTP**: added a per-(tenant, username) `brute-force` rate-limit check at the start of `passwordlessGrantUser`. Covers both `/passwordless/verify_redirect` and the `/oauth/token` OTP grant. Opt-in — only active when `data.rateLimit` is configured. A 6-digit numeric OTP is ~20 bits of entropy and was previously brute-forceable inside the 10-minute window. See [Rate Limit Adapter](/customization/adapter-interfaces/rate-limit) for the integration contract.
  - **/oauth/revoke**: confidential clients (those with a registered `client_secret`) MUST now authenticate per RFC 7009 §2.1. A missing secret on a confidential client returns `401 invalid_client` rather than silently no-op'ing. Public clients (no registered secret) continue to revoke without authenticating.
  - **management-api middleware**: removed the `AUDIENCE_EXEMPT_PREFIXES` carve-out for `/api/v2/users` and `/api/v2/users-by-email`. Tokens hitting these routes must now carry `urn:authhero:management` in `aud`. External callers still issuing tokens with the legacy audience need to migrate.
  - **scope filtering**: new tenant flag `flags.restrict_undefined_scopes` (default `false`). When `false` or absent the token's `scope` claim preserves Auth0's legacy behavior — every requested scope, defined on the API or not, is echoed verbatim. When `true`, the claim is restricted to scopes defined on the targeted resource server plus the standard OIDC scopes. Applies symmetrically to RBAC-enabled and RBAC-disabled APIs so the posture is consistent. Opt in for defense-in-depth against scope-string forgery.

## 2.9.0

### Minor Changes

- 8b9ef23: Add support for Client ID Metadata Documents (CIMD)

  The authorization server can now accept an https URL as the `client_id`, fetching and validating the client's metadata document at request time instead of requiring pre-registration or DCR. This is the preferred MCP client-registration mechanism (SEP-991) and mirrors Auth0's CIMD support.
  - New per-tenant flag `client_id_metadata_document_registration` (matches Auth0). When enabled, the AS metadata advertises `client_id_metadata_document_supported: true`.
  - Added the RFC 8414 `.well-known/oauth-authorization-server` metadata endpoint alongside `.well-known/openid-configuration`.
  - CIMD clients are resolved ephemerally (no DB record), validated against Auth0's ruleset (URL constraints, document `client_id` must match the URL, supported grant types / auth methods), fetched over SSRF-safe HTTPS, and required to use PKCE (S256) for code flows.

## 2.8.0

### Minor Changes

- 1b7a39b: Add `ProxyRoutesAdapter` interface and the `ProxyRoute` / `MiddlewareConfig` zod schemas. The contract lives here so every database adapter (`@authhero/kysely-adapter`, `@authhero/drizzle`, `@authhero/aws-adapter`) can implement it as part of `DataAdapters.proxyRoutes`, and `authhero` can ship the management API natively.
- 1b7a39b: Proxy v2: replace the legacy `path_pattern` + `upstream_type` + fixed two-phase middleware model with a JSON-configured route schema (`match` + ordered `handlers`) and a Hono-native execution model. Routes now match on path **plus** method, host pattern (`*.example.com`), request headers, and query params. Handlers are composable `(c, next) => Response` middleware compiled into a per-host Hono sub-app — they can short-circuit, reorder (e.g. `cache` before `basic_auth`), and post-process responses. Built-in handlers cover the legacy custom-domains proxy: `http`, `service_binding` (Cloudflare bindings via the new `bindings` option on `createProxyApp`), `redirect`, `static`, `cors`, `basic_auth`, `headers`, `cache`, `forwarded_headers` (X-Real-IP / X-Original-URL / X-Forwarded-\*), `rewrite_cookies` (upstream `Domain=`), and `rewrite_location` (3xx Location origin). New `createHttpProxyAdapter` reads route config from a remote AuthHero control plane over `client_credentials`, with an optional `createCacheApiHostCache` layer that uses `caches.default` for per-colo warmth (no KV needed). AuthHero exposes the privileged `GET /api/v2/proxy/control-plane/hosts/:host` endpoint via the new `proxyControlPlane` config option. Kysely and Drizzle adapters ship forward migrations that backfill existing rows; the legacy `path_pattern`/`upstream_type`/`upstream_url`/`preserve_host`/`middleware` columns are replaced with JSON `match` and `handlers`.

## 2.7.0

### Minor Changes

- 28a6135: Add in-process minting of grant-bounded service tokens for named M2M clients.
  - `@authhero/adapter-interfaces`: `EmailServiceSendParams` and `SmsServiceSendParams` now accept an optional `createServiceToken({ clientId, scope, audience?, expiresInSeconds?, customClaims? })` callback. Custom service adapters can use it to obtain a Bearer token for a DB-registered client without a stored secret or round-trip to the token endpoint.
  - `authhero`: new `createClientServiceToken` helper signs a `client_credentials`-shaped JWT locally, rejecting any audience or scope not covered by the client's existing `client_grant` records. The hook `api.token.createServiceToken` now accepts an optional `clientId` (and `audience`) to opt into the named-client path; without `clientId` the legacy `auth-service` minter is unchanged. The built-in email and SMS dispatch sites pass a tenant-bound minter into the adapter.

## 2.6.1

### Patch Changes

- 528e196: Move `kysely` from `dependencies` to `peerDependencies` in `@authhero/kysely-adapter` so consumers control the installed version and avoid duplicate Kysely instances.

  Switch every adapter package's `.d.ts` bundling from `dts-bundle-generator` to `rollup-plugin-dts` (the same tool already used by `authhero`). Adds `export *` for previously-unexported adapter modules in `@authhero/adapter-interfaces` so the new bundler emits them (the old tool re-exported them implicitly).

## 2.6.0

### Minor Changes

- dcc6501: Migrate to Zod 4 and `@hono/zod-openapi` v1. The `@hono/zod-openapi` peer dependency now requires `^1.4.0` — consumers must upgrade alongside this release.

## 2.5.0

### Minor Changes

- 1bcf864: Match Auth0's log-stream wire shape and emit additional Auth0-compatible audit events.
  - HTTP log-stream payloads now wrap the event body under a `data` key (with `log_id` and `description` at the top level), matching Auth0's wire format. Logstash/Datadog pipelines using `%{[data]}` templates will now resolve correctly instead of producing literal `_split_type_failure` tags.
  - New audit events emitted: `si`/`fi` (invite accept), `sv`/`fv` (email verification ticket), `svr`/`fvr` (verification email sent), `fcpr` (failed change-password request), `scoa`/`fcoa` (cross-origin authentication).
  - Passwordless OTP exchange now emits `sepotpft`/`fepotpft` instead of the password-OTP (MFA) codes `seotpft`/`feotpft`. Adds the new `SUCCESS_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN` log type to the catalog.

## 2.4.0

### Minor Changes

- b6e628b: Add shared `logTypeDescriptions`, `logTypeCategories`, `getLogTypeDescription`, `getLogTypeCategory`, and `LogCategory` exports so admin UIs can render log type labels and pick icons without duplicating the lookup tables. Also added the missing `INFORMATION` ("i") log type code.

## 2.3.0

### Minor Changes

- 3b086bc: Add `from_date` / `to_date` (Unix seconds) query params to the `GET /api/v2/logs` endpoint and propagate them through the kysely, drizzle, and Cloudflare Analytics Engine adapters. The admin UI now exposes these as filter inputs and reads `length` as the total count, fixing pagination beyond the first page when the backend reports `length` instead of `total`.

## 2.2.0

### Minor Changes

- 5e35511: Update for the new UI

### Patch Changes

- 5e35511: Add optional `options.configuration.realm` to connections. When set on an import-mode DB connection, it overrides the `realm` sent in the upstream password-realm grant (which previously always defaulted to the connection name). Exposed in the admin UI under the Import Mode credentials section.

## 2.1.0

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

## 2.0.0

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

## 1.19.0

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

- 1ea694f: Honor the OIDC `claims` request parameter (OIDC Core 5.5). `/authorize` now parses the `claims` parameter (JSON-encoded individual claim requests for `id_token` and/or `userinfo`), persists the request on the login session, and emits the requested standard claims at both `/userinfo` and in the ID Token regardless of scope. Adds `claims_parameter_supported: true` to the discovery document. Closes the `oidcc-claims-essential` WARNING in the OIDC conformance Basic/Hybrid/Implicit/Form-Post/Dynamic plans (issue #781).
- 1ea694f: OIDC connections can now choose how client credentials are sent to the upstream token endpoint via `options.token_endpoint_auth_method` (`client_secret_basic` — default — or `client_secret_post`). This fixes providers like JumpCloud that reject HTTP Basic auth at the token endpoint with `invalid_client`. The setting is editable in the react-admin connection form on the OIDC strategy.

  Under the hood the OIDC strategy uses `ExtendedOAuth2Client`, a small subclass of arctic's `OAuth2Client` (`strategies/internal-oauth2.ts`) that overrides `validateAuthorizationCode` for the `client_secret_post` path. Arctic's PKCE/URL/auth-URL logic and `OAuth2Tokens` shape are reused unchanged. Other strategies (Apple, Facebook, GitHub, Google, Microsoft, Vipps, generic OAuth2) still use arctic directly — they will be migrated in a follow-up PR.

- 1ea694f: Promote `disable_sign_ups` from `client_metadata` to a typed top-level `boolean` field on `Client`, and add a new `hide_sign_up_disabled_error` flag for enumeration-safe sign-up blocking.

  When `disable_sign_ups` is true and `hide_sign_up_disabled_error` is also true, the identifier screen no longer reveals that an email is unknown: it advances to the OTP/password challenge as if the account existed and fails generically at credential check. Skips OTP/magic-link delivery to unknown addresses in this stub path. Useful for tenants where email enumeration is a stronger concern than the UX cost of stranded users.

  Adds a migration that copies `client_metadata.disable_sign_ups = "true"` into the new column and removes the key from `client_metadata` so there is a single source of truth going forward. The legacy `client_metadata.disable_sign_ups` key is no longer read by the engine.

## 1.18.0

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

- 2ea1664: Add OIDC Hybrid Flow support. `response_type` now accepts `code id_token`, `code token`, and `code id_token token` — the `/authorize` redirect returns a code in the same response as an `id_token` and/or `access_token` carried in the fragment (or via `response_mode=form_post`). The front-channel id_token includes `c_hash` (always) and `at_hash` (when an access_token is co-issued) per OIDC Core 3.3.2.11. Discovery's `response_types_supported` advertises the three new values, closing the Auth0 parity gap on hybrid response types. The new `oidcc-hybrid-certification-test-plan` is wired into the conformance runner.

## 1.17.0

### Minor Changes

- 0c662c0: Add deployment history for actions and fix the runtime lookup that prevented Auth0-style actions from firing.
  - The post-login (and other code-hook) dispatcher previously only resolved code via the legacy `data.hookCode` table. Actions created through the Auth0-compatible `POST /api/v2/actions/actions` API live in `data.actions` and were silently skipped at runtime. `handleCodeHook` now resolves `code_id` from `data.actions` first and falls back to `data.hookCode`, so deployed actions bound to a trigger actually run.
  - New `actionVersions` adapter (kysely + stub for drizzle) plus a `2026-05-10` migration creating the `action_versions` table. A version row is snapshotted on every action create and on every `POST /api/v2/actions/actions/:id/deploy`, with the latest snapshot marked `deployed: true` and any prior versions cleared.
  - New management API routes: `GET /api/v2/actions/actions/:actionId/versions`, `GET /api/v2/actions/actions/:actionId/versions/:id`, and `POST /api/v2/actions/actions/:actionId/versions/:id/deploy` (rollback). Rollback re-deploys the rolled-back version's code via the configured `codeExecutor` and snapshots a new version row so history reflects the rollback.
  - Deleting an action now also removes its version history.

## 1.16.0

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

- 45f719e: Add opt-in per-tenant signing keys with control-plane fallback.
  - `SigningKey` gains an optional `tenant_id` field. Existing rows (where `tenant_id IS NULL`) are treated as the shared control-plane bucket — no migration needed.
  - The kysely keys adapter now exposes `tenant_id` as a filterable lucene field (e.g. `q: "type:jwt_signing AND tenant_id:foo"`, or `-_exists_:tenant_id` for the control-plane bucket).
  - New `signingKeyMode` config in `init({ ... })` accepts `"control-plane" | "tenant"` or a resolver `({ tenant_id }) => …`. Mirrors the `userLinkingMode` pattern so tenants can be migrated one at a time. Default is `"control-plane"`, preserving the legacy behavior where every tenant shares one key pool.
  - When a tenant resolves to `"tenant"`, signing prefers the tenant's own key and falls back to the control-plane key if the tenant has no non-revoked key yet. JWKS for that tenant publishes the union of both buckets so tokens minted by either still verify during rollout.
  - The management API `GET /signing`, `POST /signing/rotate`, `PUT /signing/{kid}/revoke`, and `GET /signing/{kid}` now scope to the `tenant-id` header. Rotating with a tenant header revokes only that tenant's keys and mints the new key with `tenant_id` set; calls without the header continue to operate on the control-plane bucket.

  Transitional: once every tenant has its own key, `signingKeyMode`, the control-plane fallback, and the legacy `tenant_id IS NULL` bucket can be removed.

### Patch Changes

- 7dd280c: Stop advertising endpoints and response types we don't actually implement in `/.well-known/openid-configuration`:
  - Removed `device_authorization_endpoint` (`/oauth/device/code`) — no device-code route is registered.
  - Removed `mfa_challenge_endpoint` (`/mfa/challenge`) — Universal-Login MFA lives at `/u2/mfa/*` and is a UI flow, not the headless Auth0 `mfa-challenge` API.
  - Narrowed `response_types_supported` to `["code", "token", "id_token", "id_token token"]`. The hybrid variants (`code token`, `code id_token`, `code id_token token`) were advertised but never handled; they remain unsupported by design (see the AuthHero vs Auth0 docs for the rationale). Clients should use `code` + PKCE.

  `device_authorization_endpoint` and `mfa_challenge_endpoint` are also dropped from `openIDConfigurationSchema` in `@authhero/adapter-interfaces`.

- 7dd280c: OIDC implicit-flow correctness fixes uncovered while wiring up the `oidcc-implicit-certification-test-plan`:
  - Use the IANA-canonical ordering for combined `response_type` values: `AuthorizationResponseType.TOKEN_ID_TOKEN` is now `"id_token token"` (was `"token id_token"`), and `/.well-known/openid-configuration` advertises `response_types_supported` in the canonical OIDC Core 3.2 order. The `/authorize` endpoint canonicalises the order of any incoming `response_type` before validation, so requests using either order continue to be accepted.
  - For clients with `auth0_conformant: false`, scope-driven claims are now included in the ID Token whenever an ID Token is issued at the authorization endpoint — i.e. for any `response_type` containing `id_token` (Implicit `id_token` / `id_token token`, Hybrid `code id_token` / `code id_token token`). Previously only the bare `id_token` response type qualified, which tripped the OIDF conformance check `VerifyScopesReturnedInAuthorizationEndpointIdToken` for `id_token token` flows.
  - The OIDC Core 5.4 scope-to-claim mapping (profile/email/address/phone) is now shared between the ID Token and `/userinfo` via a single `buildScopeClaims` helper. Previously the ID Token only emitted a 6-claim subset of profile (`name`, `given_name`, `family_name`, `nickname`, `picture`, `locale`) and skipped address/phone entirely, while `/userinfo` emitted the full set. The ID Token now matches `/userinfo`: `middle_name`, `preferred_username`, `profile`, `website`, `gender`, `birthdate`, `zoneinfo`, `updated_at`, `address`, `phone_number`, `phone_number_verified` are all included when the corresponding scope is requested and the user has the value set.
  - Silent-auth (`prompt=none`) responses now pick the URL fragment for any non-`code` response_type, not just `token` and `id_token token`. Previously a `prompt=none` request with `response_type=id_token` and no active session returned its `error=login_required` via the URL query, which the OIDF check `RejectErrorInUrlQuery` flags. Same predicate covers the silent-auth success path and is forward-compatible with hybrid response types.
  - `createAuthTokens` now falls back to looking up the session's `authenticated_at` to populate `auth_time` when the caller hasn't supplied one. Code-flow and silent-auth callers already compute it, but the universal-login implicit/hybrid path went straight from credential submission to `createAuthTokens` without that step, so `oidcc-max-age-1` failed for implicit with "auth_time claim is missing from the id_token, but it is required for a authentication where the max_age parameter was used".

## 1.15.0

### Minor Changes

- 639ab29: Add lazy-migration support from an upstream Auth0 tenant. Two flows are gated by the existing `connection.options.import_mode` flag (already part of the Auth0 connection schema):
  - **Password fallback** — when a `Username-Password-Authentication` connection has `import_mode: true`, password logins that miss locally (no user, or no matching hash) fall back to the upstream Auth0's password-realm grant. On success the user/profile is fetched from `/userinfo` and the bcrypt hash is stored locally so subsequent logins are served entirely from authhero. No M2M token required.
  - **Refresh-token proxy** — when a `strategy: "auth0"` connection has `import_mode: true`, refresh-token grant requests whose token doesn't match any local row are forwarded to the upstream `/oauth/token` and the response is relayed verbatim (rotation, error shapes, etc.). Existing Auth0 sessions keep working until the next interactive login migrates the user via the password-fallback path.

  Configuration uses standard `connections` records — no new tenant fields, no new management API routes. A new `Strategy.AUTH0 = "auth0"` value identifies the upstream-source connection (filtered out of the universal-login button list automatically). The connection's `options` re-uses existing fields: `token_endpoint`, `userinfo_endpoint`, `client_id`, `client_secret`, `import_mode`. The react-admin connection edit form gains a dedicated section for these fields when `strategy === "auth0"`.

## 1.14.0

### Minor Changes

- 85d1d06: Add `/login/callback` as the new path for the upstream connection callback. The existing `/callback` route continues to work but is now marked as deprecated in the OpenAPI spec.

  Connections can also override the redirect_uri sent to the upstream IdP via the new `options.callback_url` field. When set, the strategy uses that URL verbatim; when unset, it falls back to the legacy `${authUrl}callback`. This lets operators flip individual connections to `/login/callback` (or any other registered redirect URI) one at a time as they update each IdP's allowed redirect URIs — no big-bang migration required.

## 1.13.0

### Minor Changes

- e0cd449: Add Home Realm Discovery (HRD) via `domain_aliases` on connection options. When a user enters their email at the universal-login identifier prompt, authhero now looks for an enterprise/social connection whose `options.domain_aliases` contains the email's domain and, on a match, redirects straight to that IdP — skipping the password / OTP step.
  - New optional field: `Connection.options.domain_aliases: string[]` (Auth0-compatible, stored in the existing `options` JSON column — no DB migration).
  - Domain matching is case-insensitive and exact (no wildcards).
  - Only enterprise/social strategies are eligible; HRD ignores `domain_aliases` set on `Username-Password-Authentication`, `email`, or `sms` connections.
  - Domain match wins over an existing local-password user with the same email.
  - The react-admin connection edit form now exposes a Domain Aliases input on non-database connections.

- 86fe6e8: Support `private_key_jwt` and `client_secret_jwt` client authentication at `/oauth/token` (RFC 7523 §3 / OIDC Core §9). Clients can now authenticate by sending a signed JWT in `client_assertion` instead of a `client_secret`.

  How it works:
  - The client posts `client_assertion=<JWT>` and `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`. `client_id` may be sent as a form field or omitted (in which case it's derived from the assertion's `sub` claim).
  - For `private_key_jwt` (asymmetric), the assertion is verified against the client's `registration_metadata.jwks` (inline) or `client_metadata.jwks_uri` (fetched with the same SSRF guard used by request objects). RS256/RS384/RS512 + ES256/ES384/ES512 are accepted.
  - For `client_secret_jwt` (HMAC), the assertion is verified against the client's stored `client_secret`. HS256/HS384/HS512 are accepted.
  - The verifier enforces RFC 7523 claims: `iss == sub == client_id`, `aud` matching the token endpoint URL or the OP issuer, required `exp` (with 30 s leeway), optional `nbf`. `alg=none` is rejected.
  - Sending both `client_secret` and `client_assertion` is rejected with `invalid_request`.
  - All existing grants (authorization_code, client_credentials, refresh_token) honor the assertion: their `client_secret` comparison is skipped when the request authenticated via assertion. `code_verifier` (PKCE) still applies to the authorization-code grant when present.

  Schema / discovery:
  - `Client.token_endpoint_auth_method` now accepts `client_secret_jwt` and `private_key_jwt` alongside the existing values. Dynamic Client Registration accepts the same values for `token_endpoint_auth_method`.
  - Discovery's `token_endpoint_auth_methods_supported` now lists `["client_secret_basic", "client_secret_post", "client_secret_jwt", "private_key_jwt"]`.

  For replay protection, this release validates `exp` (and the optional `nbf`) but does not yet track `jti`. Most basic OIDC conformance test plans pass with `exp`-only; FAPI requires `jti` tracking, which can be added later as a separate change.

- 3891832: Support EC signing keys (ES256/ES384/ES512) for ID and access tokens. The signing algorithm is now derived from the key material at issue time, so a tenant can swap its `jwt_signing` key from RSA to EC P-256/P-384/P-521 (via `createX509Certificate({ keyType: "EC-P-256" })`) without changing any other configuration. RSA keys continue to sign with RS256.

  Discovery now advertises `id_token_signing_alg_values_supported: ["RS256", "ES256", "ES384", "ES512"]`, and `/.well-known/jwks.json` publishes EC keys with the proper `kty`/`crv`/`x`/`y` members and an explicit `alg`. The exported `jwksSchema` no longer requires `n` and `e` (those are now optional, alongside the new EC fields), so consumers narrowing on `kty` before reading members may need a small adjustment.

  PS256/PS384/PS512 are not yet supported; they require an explicit per-key alg field and will follow in a subsequent change.

### Patch Changes

- f41b85c: Verify signed Request Objects at `/authorize` (RFC 9101 / OIDC Core §6.1) and add support for `request_uri` (§6.2). Previously the `request=` JWT was decoded without checking its signature — any caller could forge claims and have them merged into the authorization request. That hole is now closed.

  Behaviour changes:
  - `request=` JWTs are signature-verified against the client's keys. `alg=none` (unsigned request objects) is rejected. HS256/HS384/HS512 verify against `client_secret`; RS*/ES* verify against the client's `registration_metadata.jwks` (inline) or `client_metadata.jwks_uri` (fetched). The verifier also enforces `iss == client_id` (when present), `aud` matching the OP issuer, and `exp`/`nbf` with 30s leeway.
  - `request_uri` is now accepted. The URL is fetched with an SSRF guard (https-only by default, blocks `localhost` and private/loopback/link-local IPv4 + IPv6 ranges, 5s timeout, 64 KiB body cap) and the JWT body runs through the same verifier.
  - Sending both `request` and `request_uri` is rejected with HTTP 400 per the spec.
  - Discovery now advertises `request_uri_parameter_supported: true` and adds `request_object_signing_alg_values_supported: ["RS256","RS384","RS512","ES256","ES384","ES512","HS256","HS384","HS512"]`.

  For tests/local development, set `ALLOW_PRIVATE_OUTBOUND_FETCH: true` on the env binding to relax the SSRF guard (allows `http://`, `localhost`, and private IPs).

## 1.12.0

### Minor Changes

- 32aacc6: Action secrets PATCH now preserves existing values when an incoming secret omits its `value` (matched by `name`). The `value` field is optional on writes so admin UIs can round-trip a masked secrets list without overwriting stored values.
- a4e29bd: Add a `RateLimitAdapter` interface and an opt-in Cloudflare implementation
  backed by the Workers Rate Limiter binding. The cloudflare adapter accepts
  `rateLimitBindings` (per-scope: `pre-login`, `pre-user-registration`,
  `brute-force`) and returns a `rateLimit` adapter when at least one binding
  is configured. Missing bindings or thrown errors fail open so a misconfigured
  deploy never locks users out.

  The password grant now consults `data.rateLimit?.consume("pre-login", ...)`
  keyed by `${tenantId}:${ip}` when the tenant has
  `suspicious_ip_throttling.enabled` and the IP is not in the allowlist. The
  Workers Rate Limiter only supports 10s/60s windows, so the configured
  `max_attempts` is intentionally not honored — see the Durable Object
  follow-up note in `packages/cloudflare/src/rate-limit/index.ts` for the
  plan to support tenant-tunable thresholds.

- 32aacc6: Capture `console.*` output from dynamic code hooks and emit a log entry for every execution.
  - Added `SUCCESS_HOOK` (`"sh"`) log type and a new `CodeExecutionLog` shape on `CodeExecutionResult.logs`.
  - The Cloudflare and Local executors now shadow `console` inside the sandbox and return up to 50 captured entries (each truncated to 500 chars) per execution.
  - `handleCodeHook` now writes a `SUCCESS_HOOK` log on success and a `FAILED_HOOK` log on failure, with `hook_id`, `code_id`, `trigger_id`, `duration_ms`, recorded `api_calls`, and the captured `logs` array on the log's `details` payload — surfacing dynamic-action execution in the tenant log feed for debugging.

- 6e5762c: Add `theme.page_background.logo_placement` (`widget` | `chip` | `none`) to control where the tenant logo renders on the universal-login page. Defaults to `widget` (the widget's own internal header). When set to `chip` or `none`, the widget's internal logo is suppressed via `theme.widget.logo_position = "none"` so there's no duplicate.
- 32aacc6: Add `default_client_id` to the tenant schema. `/connect/start` now prefers this client as the login_session anchor for tenant-level DCR consent flows, falling back to the first available client so a brand-new tenant can still bootstrap its first integration. Roughly analogous to Auth0's "Default App" / Global Client.

## 1.11.0

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

## 1.10.3

### Patch Changes

- e5cbfe7: Advertise `end_session_endpoint` in `/.well-known/openid-configuration` when the tenant flag `oidc_logout.rp_logout_end_session_endpoint_discovery` is enabled (off by default, matching Auth0). Required for OIDC RP-Initiated Logout. Also adds the optional `end_session_endpoint` field to the `openIDConfigurationSchema`.
- dd071e0: Add `Cache-Control: no-store` and `Pragma: no-cache` headers to the token endpoint response (per RFC 6749 §5.1) and advertise `grant_types_supported` in the OpenID Connect discovery document. Reject refresh-token exchanges where the refresh token's `client_id` does not match the authenticating client. Implement `POST /oauth/revoke` per RFC 7009 (refresh-token revocation, with `client_secret_basic` and `client_secret_post` client authentication).

## 1.10.2

### Patch Changes

- 3230b9b: Hook metadata bag + control-plane template inheritance.

  Adds a free-form `metadata: Record<string, unknown>` field to all hook variants (web, form, template, code), persisted as JSON in kysely + drizzle. Two well-known keys are defined:
  - `metadata.inheritable: true` — when set on a hook on the control-plane tenant, the multi-tenancy runtime fallback surfaces that hook on every sub-tenant's `hooks.list` and `hooks.get`. Inherited hooks are read-only from the sub-tenant's perspective: writes go through the base adapter's `tenant_id` WHERE clause and are silent no-ops on cross-tenant rows.
  - Template options. The dispatcher forwards `hook.metadata` to the template function. The `account-linking` template reads `metadata.copy_user_metadata: true` to merge the secondary user's `user_metadata` into the primary's on link (primary wins on key conflicts; `app_metadata` is never copied).

  Includes the kysely migration `2026-04-29T10:00:00_hooks_metadata` adding the `metadata` column.

## 1.10.1

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

## 1.10.0

### Minor Changes

- ba03e14: Drop `dcr_allowed_integration_types` tenant flag and per-tenant allowlist check on `/connect/start`. `integration_type` is now an optional free-form label — `enable_dynamic_client_registration` alone gates the connect flow. Existing callers that pass `integration_type` continue to work; the value still flows into the IAT constraints and consent screen when supplied.

## 1.9.0

### Minor Changes

- 2578652: Allow http `return_to` on `/connect/start` for loopback hosts and tenant-allowlisted dev origins.

  `GET /connect/start` previously required `return_to` to be `https://<domain>` and rejected all `http://` schemes. That broke local-dev integrators (e.g. WordPress under `wp-env` at `http://127.0.0.1:8888`).

  The new rule:
  - HTTPS is always permitted (no behavior change).
  - HTTP is permitted iff:
    1. The host is loopback — `localhost`, `127.0.0.1`, or `[::1]` (any port). Aligned with RFC 8252 §7.3.
    2. The exact origin (scheme + host + port) appears in the new tenant flag `allow_http_return_to`.
  - `0.0.0.0` is always rejected; `localhost.<anything>` is not pattern-matched; trailing dots and case variations are normalized.
  - `domain` and `return_to` still must agree on scheme + host + port. `domain` may now be passed as a fully-qualified origin (`http://127.0.0.1:8888`); bare host[:port] continues to mean implicit `https://`.

  The consent screen at `/u2/connect/start` shows a "Local development" badge when `domain` is loopback or matches the tenant allowlist, so a user can spot a phishing attempt that claims a `localhost` callback they didn't initiate.

  A new `flags.allow_http_return_to: string[]` field is added to the tenant schema. Default `[]`. Each entry must be a fully-qualified `http://` origin with no path/query/fragment; malformed entries are rejected on write.

## 1.8.0

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

## 1.7.0

### Minor Changes

- 9145dbd: Preserve `user_id`, `audience`, and `scope` on outbox-delivered log entries. Previously, when `logMessage` was routed through the outbox (e.g., successful login via `post-user-login` hook), the `AuditEvent` → `LogInsert` transform dropped these fields: `actor.id` ignored `params.userId` in favor of only `ctx.var.user_id`, and `audience` was hardcoded to `""` because the `AuditEvent` schema lacked those fields.
  - Add optional `audience` and `scope` to `AuditEventInsert`.
  - `buildAuditEvent` now falls back `actor.id` to `params.userId`, sets `actor.type = "user"` for user-initiated events, and categorizes them as `"user_action"`.
  - `toLogInsert` maps `event.audience` and `event.scope` through to the log row.

- 9145dbd: Drop the multi-statement transaction from `refreshTokens.update`. The previous implementation ran UPDATE + SELECT + UPDATE inside `db.transaction()` to extend the parent `login_session` expiry, which on async HTTP drivers (PlanetScale, D1) meant three sequential round-trips plus BEGIN/COMMIT and held a row lock on `login_sessions` across the whole transaction — creating a hot-row hotspot when multiple refresh tokens shared a `login_id`.
  - Add optional `UpdateRefreshTokenOptions.loginSessionBump` to the adapter interface. The caller now provides `login_id` and the pre-computed new `expires_at`, so the adapter avoids a read-before-write.
  - `refreshTokens.update` issues the refresh-token and login-session UPDATEs concurrently via `Promise.all`, collapsing wall-clock latency to roughly one round-trip on async drivers. The bump is idempotent (`WHERE expires_at_ts < new`) and self-healing (next refresh re-bumps on a transient failure), so strict atomicity is not required.
  - Fix `ctx.req.header["x-real-ip"]` / `["user-agent"]` — Hono exposes `header` as a function, so bracket access has been silently writing empty strings to `device.last_ip` / `device.last_user_agent` since the grant landed. Use `ctx.req.header("x-real-ip")` and skip the `device` write entirely when IP and UA are unchanged.

## 1.6.0

### Minor Changes

- 7d9f138: Soft-revoke refresh tokens instead of hard-deleting them. Adds a `revoked_at` field to the `RefreshToken` schema, a `revokeByLoginSession(tenant_id, login_session_id, revoked_at)` adapter method, and a `refresh_tokens.revoked_at_ts` column. The logout route now issues a single bulk UPDATE (fixing a pagination bug where sessions with >100 refresh tokens were not fully revoked), and the refresh-token grant rejects revoked tokens with an `invalid_grant` error.

## 1.5.0

### Minor Changes

- 931f598: Add `GET /authorize/resume` endpoint mirroring Auth0's terminal login-session resumption point.

  Sub-flows now persist the authenticated identity onto the login session (new `auth_strategy` and `authenticated_at` columns on `login_sessions`) and 302 the browser to `/authorize/resume?state=…`. The resume endpoint owns (a) hopping back to the original authorization host when the browser is on the wrong custom domain so the session cookie lands under the right wildcard, and (b) dispatching based on the login-session state machine to the final token/code issuance or to the next MFA/continuation screen.

  The social OAuth callback is migrated as the first consumer: the old 307-POST cross-domain re-dispatch in `connectionCallback` is replaced by a plain 302 to `/authorize/resume`, and the OAuth code exchange now always runs once on whichever host the provider called back to. Subsequent PRs will migrate the password / OTP / signup / SAML sub-flows to the same pattern, after which the ad-hoc `Set-Cookie` forwarding layers in Universal Login can be removed.

## 1.4.1

### Patch Changes

- 1d15292: Hide `registration_completed_at` from management API responses and hook payloads. The field is internal — used only by the self-healing post-user-registration re-enqueue logic — and is now stripped from `auth0UserResponseSchema`, the `GET/PATCH /users/:user_id` responses, all webhook bodies (via `invokeHooks`), the outbox `target.after` payload, and the `onExecutePostLogin` / `onExecutePreUserUpdate` / `onExecutePre|PostUserDeletion` event objects.

## 1.4.0

### Minor Changes

- d84cb2f: Complete the transaction fixes

## 1.3.0

### Minor Changes

- 2f6354d: Make session lifetime cofigurable

## 1.2.0

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

## 1.1.0

### Minor Changes

- 3da602c: Trim transactions

## 1.0.0

### Major Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

## 0.155.0

### Minor Changes

- a59a49b: Implement disable-sso

## 0.154.0

### Minor Changes

- fa7ce07: Updates for passkeys login

## 0.153.0

### Minor Changes

- 884e950: Update outbox

## 0.152.0

### Minor Changes

- f3b910c: Add outbox pattern

## 0.151.0

### Minor Changes

- 3e74dea: Update handling of host headers
- 022f12f: Move email and sms to adapters

## 0.150.0

### Minor Changes

- 164fe2c: Added passkeys

## 0.149.0

### Minor Changes

- 64e858a: Add mfa with logging

## 0.148.0

### Minor Changes

- 469c395: Language refactor

## 0.147.0

### Minor Changes

- 5e73f56: Remove magic strings
- 5e73f56: Replace magic strings

## 0.146.0

### Minor Changes

- 318fcf9: Update widget links
- 318fcf9: Update widget links

## 0.145.0

### Minor Changes

- 30b5be1: Add support for set_user_root_attributes

## 0.144.0

### Minor Changes

- dcbd1d7: Store the used connection on the login_session

## 0.143.0

### Minor Changes

- 39df1aa: Change url of enter-code page

## 0.142.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

## 0.141.0

### Minor Changes

- 3de697d: Add support for http validation of domains

## 0.140.0

### Minor Changes

- 7154fe1: Update refresh-tokens schema

## 0.139.0

### Minor Changes

- 2617efb: Update stylig for widget

## 0.138.0

### Minor Changes

- 192f480: First step in refresh tokens refactor

## 0.137.0

### Minor Changes

- 0719de4: Add username to indetifier array

## 0.136.0

### Minor Changes

- d7bcd19: Add hook templates

## 0.135.0

### Minor Changes

- 65321b7: Update for forms, flows and u2 login

## 0.134.0

### Minor Changes

- a5c1ba9: Add mfa signup

## 0.133.0

### Minor Changes

- 7adc7dc: Add the password fields to the connection entity

## 0.132.0

### Minor Changes

- 131ea43: Add more node fields

## 0.131.0

### Minor Changes

- c5935bd: Update the new widget endpoints

## 0.130.0

### Minor Changes

- ac8af37: Add custom text support

## 0.129.0

### Minor Changes

- a8e70e6: Update schemas to remove old fallbacks

## 0.128.0

### Minor Changes

- 6585906: Move universal login templates to separate adapter

## 0.127.0

### Minor Changes

- fd374a9: Set theme id
- 8150432: Replaced legacy client

## 0.126.0

### Minor Changes

- 154993d: Improve react-admin experience by clearing caches and setting cores

## 0.125.0

### Minor Changes

- 491842a: Bump packages to make sure the universal_login_templates is available

## 0.124.0

### Minor Changes

- 2af900c: Create a per user session cleanup
- 2be02f8: Add dynamic liquid templates

## 0.123.0

### Minor Changes

- 2d0a7f4: Add a auth0-conformance flag

## 0.122.0

### Minor Changes

- 9d6cfb8: Wrap adapters as part of the multi-tenant package

## 0.121.0

### Minor Changes

- 2853db0: Only show the selected connections for a client
- 967d470: Add a metadata field to roles and resource-servers

## 0.120.0

### Minor Changes

- 00d2f83: Update versions to get latest build

## 0.119.0

### Minor Changes

- 8ab8c0b: Start adding xstate

## 0.118.0

### Minor Changes

- b7bb663: Make organizations lowercase

## 0.117.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

## 0.116.0

### Minor Changes

- 9c15354: Remove shadcn and updated widget

## 0.115.0

### Minor Changes

- f738edf: Add checkpoint pagination for organizations

## 0.114.0

### Minor Changes

- 17d73eb: Change name of organization flag and add OR support in lucence queries
- e542773: Fixes for syncing resources servers and global roles

## 0.113.0

### Minor Changes

- d967833: Add a stencil-js widget for login

## 0.112.0

### Minor Changes

- ae8553a: Add is_system to all adapters

## 0.111.0

### Minor Changes

- 906337d: Add flows support

## 0.110.0

### Minor Changes

- a108525: Add flows

## 0.109.0

### Minor Changes

- 1bec131: Add stats endpoints and activity view

## 0.108.0

### Minor Changes

- 0e906aa: Generalize the base adapter

## 0.107.0

### Minor Changes

- 212f5c6: Update the connection schema for password strength

## 0.106.0

### Minor Changes

- f37644f: Update the node types for the forms

## 0.105.0

### Minor Changes

- 40caf1a: Add support for different connections for different clients. And support sorting.

## 0.104.0

### Minor Changes

- 125dbb9: Flow updates

## 0.103.0

### Minor Changes

- b0c4421: Add oidc and icon_url
- c96d83b: Added dispaly name on connections

## 0.102.0

### Minor Changes

- 0566155: Get provider from connection
- 0566155: Remove country 3 and country name fields

## 0.101.0

### Minor Changes

- 0ffb5ca: Add support for password strength

## 0.100.0

### Minor Changes

- 3a0d8ee: Add geo info

## 0.99.0

### Minor Changes

- a3c69f0: Add support for logs with cloudflare sql

## 0.98.0

### Minor Changes

- 6067f00: Update the hook names

## 0.97.0

### Minor Changes

- Update the logs schemas

## 0.96.0

### Minor Changes

- Added invites

## 0.95.0

### Minor Changes

- Merge settings and tenants table

## 0.94.0

### Minor Changes

- Add settings endpoint

## 0.93.0

### Minor Changes

- Add new events and update chadcn layout

## 0.92.0

### Minor Changes

- Remove disable signup from legacy client

## 0.91.0

### Minor Changes

- 149ab91: Drop the old application table
- b0e9595: Add client grants

## 0.90.0

### Minor Changes

- Update to use new clients

## 0.89.0

### Minor Changes

- Create new clients table

## 0.88.0

### Minor Changes

- Changed to LegacyClient as a first step in the refactor

## 0.87.0

### Minor Changes

- Get organizations crud working like auth0

## 0.86.0

### Minor Changes

- Add users to organizations

## 0.85.0

### Minor Changes

- Added organizations

## 0.84.0

### Minor Changes

- Add cache adapter

## 0.83.0

### Minor Changes

- Add type to keys

## 0.82.0

### Minor Changes

- Add user roles

## 0.81.0

### Minor Changes

- fc8153d: Update structure and endpoints

## 0.80.0

### Minor Changes

- Add roles

## 0.79.0

### Minor Changes

- Add resource servers, rules and permissions

## 0.78.0

### Minor Changes

- Remove vendorsettings

## 0.77.0

### Minor Changes

- Add client_metadata to client type

## 0.76.0

### Minor Changes

- Update the themes entity

## 0.75.0

### Minor Changes

- Add themes endpoints

## 0.74.0

### Minor Changes

- Refactor log types

## 0.73.0

### Minor Changes

- Use countrycode from vendor settings if available

## 0.72.0

### Minor Changes

- Add text form component

## 0.71.0

### Minor Changes

- Preserve app_metadata fields during /u/check-account; guard updating app_metadata.strategy; add test.

## 0.70.0

### Minor Changes

- Added state and nonce to codes

## 0.69.0

### Minor Changes

- Add redirect_uri to codes

## 0.68.0

### Minor Changes

- Add code_challenge to codes table

## 0.67.0

### Minor Changes

## 0.66.0

### Minor Changes

- Add a login_completed flag to the login sessions

## 0.65.0

### Minor Changes

- Add a form_id property to hooks

## 0.64.0

### Minor Changes

- Add form components schemas

## 0.63.0

### Minor Changes

- Update forms schema

## 0.62.0

### Minor Changes

- Update the forms fileds

## 0.61.0

### Minor Changes

- Add forms

## 0.60.0

### Minor Changes

- Update the post users

## 0.59.0

### Minor Changes

- Separated the connections option schema

## 0.58.0

### Minor Changes

- Create sms users

## 0.57.0

### Minor Changes

- Add a otp grant flow for token

## 0.56.0

### Minor Changes

- Sms support

## 0.55.0

### Minor Changes

- Add a getByDomain function for cutsom domains and a tenant-id middleware

## 0.54.0

### Minor Changes

- Add domain verification info

## 0.53.0

### Minor Changes

- Make the cloudflare custom domains adapter use another adpater for storage

## 0.52.0

### Minor Changes

- Set the session id on login sessions

## 0.51.0

### Minor Changes

## 0.50.0

### Minor Changes

- Add an optional session refrence to login_sessions and cleanup old tables

## 0.49.0

### Minor Changes

## 0.48.0

### Minor Changes

- Get passwords can return nul

## 0.47.0

### Minor Changes

- Add custom domains table and adapter

## 0.46.0

### Minor Changes

- Handle expires at for sessions

## 0.45.0

### Minor Changes

- Update entities for sessions and refresh tokens

## 0.44.0

### Minor Changes

- Recreate the tables for sessions and refresh tokens

## 0.43.0

### Minor Changes

- make it possible to create a tenant with an id

## 0.42.0

### Minor Changes

- Update session entity

## 0.41.0

### Minor Changes

- 23c2899: Use default audience from tenant for refresh token

## 0.40.0

### Minor Changes

- Add refresh tokens to jwt

## 0.39.0

### Minor Changes

- Store refresh tokesn

## 0.38.0

### Minor Changes

- Add table for refresh tokens

## 0.37.0

### Minor Changes

- Optimized bundles

## 0.36.0

### Minor Changes

- use default listparams

## 0.35.0

### Minor Changes

- migrate connection auth
- a0a18c9: move most of authorize endpoint

## 0.34.0

### Minor Changes

- add password routes

## 0.33.0

### Minor Changes

- add sendgrid and postmark mail services
- migrate dbconnections and setup email providers

## 0.32.1

### Patch Changes

- update all build packages

## 0.32.0

### Minor Changes

- add hooks to add claims to token

## 0.31.0

### Minor Changes

- set used_at for codes

## 0.30.0

### Minor Changes

- fix incorrect imports

## 0.29.1

### Patch Changes

## 0.29.0

### Minor Changes

- add silent tokens

## 0.28.0

### Minor Changes

- switch back to native enum

## 0.27.0

### Minor Changes

- moved token types from the interfaces to the authhero package

## 0.26.0

### Minor Changes

- add ip to logins table

## 0.25.0

### Minor Changes

- added email providers and removed tickets
- Added email providers

## 0.24.0

### Minor Changes

- add code verifier to codes table

## 0.23.0

### Minor Changes

- make strategy mandatory for connections

## 0.22.1

### Patch Changes

- remove the iife build files

## 0.22.0

### Minor Changes

- Get the demo project rendering

## 0.21.0

### Minor Changes

- Added a act-as property to the auth params

## 0.20.3

### Patch Changes

- Expose the migration script for kysely and add authhero test

## 0.20.2

### Patch Changes

- Update packages

## 0.20.1

### Patch Changes

- Add prompt to login sessions

## 0.20.0

### Minor Changes

- Add ui_locales to authparams

## 0.19.0

### Minor Changes

- Add freja as connection type

## 0.18.0

### Minor Changes

- Expose app_metadata and user_metadata

## 0.17.1

### Patch Changes

- Add missing properties

## 0.17.0

### Minor Changes

- Change to use a json field for connection options

### Patch Changes

- Add more properties to connection options

## 0.16.0

### Minor Changes

- Remove old properties of connections

## 0.15.6

### Patch Changes

- Change the allowed_clients on the application to be string in kysely and array of strings in interfaces

## 0.15.5

### Patch Changes

- Changed so promptsetting uses a partial for the update

## 0.15.4

### Patch Changes

- Change order of default and optional

## 0.15.3

### Patch Changes

- Make properties with defaults optional

## 0.15.2

### Patch Changes

- Make application default to empty arrays and a nanoid for secret

## 0.15.1

### Patch Changes

- Make options optional

## 0.15.0

### Minor Changes

- Add prompt settings and update the connection entity
- Add prompt settings adapter

## 0.14.0

### Minor Changes

- Refine the jswks typs

## 0.13.0

### Minor Changes

- Remove certificate type
- Remove the certificate type and add new update method

## 0.12.0

### Minor Changes

- Updated the certificate entity

### Patch Changes

- Made certificate properties optional

## 0.11.9

### Patch Changes

- Remove the otp table

## 0.11.8

### Patch Changes

- Removed unused tables

## 0.11.7

### Patch Changes

- Add the user id to the codes entity

## 0.11.6

### Patch Changes

- Rebuilt the interfaces

## 0.11.5

### Patch Changes

- Added a connection_id property to the codes

## 0.11.4

### Patch Changes

- Add samlp specific validation for application

## 0.11.3

### Patch Changes

- Simplify client

## 0.11.2

### Patch Changes

- Refactor applications and clients

## 0.11.1

### Patch Changes

- Update the application types

## 0.11.0

### Minor Changes

- Add the addons property

### Patch Changes

- Update the applications schema to handle addOns

## 0.10.5

### Patch Changes

- Added pre-user-signup hook type

## 0.10.4

### Patch Changes

- Add more log types

## 0.10.3

### Patch Changes

- Handle boolean values

## 0.10.2

### Patch Changes

- Fix typo in property

## 0.10.1

### Patch Changes

- Add properties to hooks

## 0.10.0

### Minor Changes

- Updated the types for logins and fixed the packaging for authhero

## 0.9.2

### Patch Changes

- Fix plural on the logins adapter

## 0.9.1

### Patch Changes

- Centralized all codes to the codes table and added a new logins table for the login sessions. The old tables will be removed in the next update

## 0.9.0

### Minor Changes

- Added themes and changed primary key for sessions

## 0.8.0

### Minor Changes

- Moved bcrypt out of adapter

## 0.7.0

### Minor Changes

- Updated the builds and d.ts files

## 0.6.0

### Minor Changes

- Added a package for kysely

## 0.5.3

### Patch Changes

- Change the otp to be code or link

## 0.5.2

### Patch Changes

- 3625688: Build client adapters

## 0.5.1

### Patch Changes

- Add plural s to clients

## 0.5.0

### Minor Changes

- Add a temporary client adapter until we can pass the tenant_id

## 0.4.0

### Minor Changes

- Update the adapters
- Update the OTP entity to not include the client_id and tenant_id

## 0.3.1

### Patch Changes

- Created a new build for the adapters

## 0.3.0

### Minor Changes

- Updated the adapter for otps

## 0.2.2

### Patch Changes

- Missed doing a manula build

## 0.2.1

### Patch Changes

- Added missing exports, updated readme

## 0.2.0

### Minor Changes

- Update the Session and UniversalLoginSession adapter

## 0.1.3

### Patch Changes

- Add typescritpt types

## 0.1.2

### Patch Changes

- Update package json with correct path to artefacts

## 0.1.1

### Patch Changes

- Fixed the npm publishing so it's only including the dist folder

## 0.1.0

### Minor Changes

- Added package for apapter interfaces
