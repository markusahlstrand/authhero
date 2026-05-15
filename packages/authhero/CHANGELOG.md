# authhero

## 5.2.0

### Minor Changes

- 9020382: Email provider improvements:
  - Fix Mailgun send failing with `400 Only one parameters 'html' or 'template' is allowed`. The adapter now sends `html` when provided and falls back to `template` only when no rendered HTML is available.
  - Add built-in `ResendEmailService` (`emailProvider.name === "resend"`). Credentials: `{ api_key }`. POSTs JSON to `https://api.resend.com/emails`.
  - Add built-in `PostmarkEmailService` (`emailProvider.name === "postmark"`). Credentials: `{ api_key }` (used as `X-Postmark-Server-Token`). Uses `/email` with `HtmlBody`/`TextBody` when `html` is provided, otherwise `/email/withTemplate` with `TemplateAlias` + `TemplateModel`.

## 5.1.1

### Patch Changes

- e529742: Fix "Illegal invocation" error when sending email via Mailgun on Cloudflare Workers. The global `fetch` was being called with `this` bound to the service instance instead of `globalThis`.

## 5.1.0

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

- dd833e1: Route email sends through the built-in provider matching `emailProvider.name`, and log notification failures to the audit log.

  **Dispatch by provider name.** `sendEmail` now looks up `emailProvider.name` against a built-in service registry before falling back to the injected `ctx.env.data.emailService`. Currently the only built-in is `mailgun` (`MailgunEmailService`); anything else continues to delegate to the host application's `emailService` adapter as before. This matches the existing comment on `emailProviderSchema` ("The sending layer validates by `name`") and means a tenant that configures a mailgun provider no longer has its credentials parsed by an unrelated adapter (e.g. SES/SQS) and fail with a generic 500.

  **Failure logging.** Both `sendEmail` and `sendSms` now wrap the underlying `.send()` call in a try/catch that:
  - Emits `console.error` with tenant id, provider name, template, and recipient so the error is greppable in stdout.
  - Writes a `LogTypes.FAILED_SENDING_NOTIFICATION` (`"fn"`) entry to the tenant's audit logs (`waitForCompletion: true`) including the provider name and error message.
  - Re-throws the original error so existing error-handling behavior is preserved.

  Previously a failing email/SMS provider produced a generic `Internal server error` response from the universal-login screen-api with no audit-log entry, making misconfigured providers hard to diagnose.

- 52aba15: Tighten `/api/v2/stats/daily` and `/api/v2/stats/active-users` to match Auth0's semantics.

  **`logins` no longer over-counts.** All three stats adapters (kysely, drizzle, cloudflare/analytics-engine) now count only `s` (SUCCESS_LOGIN) as a login. Previously they also summed token exchanges (`seacft`, `seccft`, `sepft`, `sertft`) and silent auth (`ssa`), which inflated the figure substantially for SPAs that refresh tokens frequently. Auth0's daily-stats `logins` is just successful logins, so the numbers now line up.

  **`leaked_passwords` matches Auth0's definition.** Adapters now sum only `pwd_leak` (breached-password detection). The authhero-internal `signup_pwd_leak` and `reset_pwd_leak` variants are no longer included in this metric.

  **`/stats/active-users` only counts real logins.** Same narrowing — distinct users with a `SUCCESS_LOGIN` in the last 30 days, not distinct users who happened to exchange a refresh token.

  **Zero-fill in `/stats/daily`.** The route now returns one row per day in the requested range, including days with no events (Auth0 behavior). Previously consumers got gaps for empty days, breaking graphs that iterate the array sequentially.

- Updated dependencies [e9bef63]
- Updated dependencies [7c8668d]
  - @authhero/adapter-interfaces@2.1.0
  - @authhero/widget@0.32.22

## 5.0.0

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

- 63bf3a9: Enrich the audit logs emitted when a user-lifecycle hook (`onExecutePreUserRegistration`, `onExecutePostUserRegistration`, `onExecutePostUserDeletion`, and the post-registration / post-update template hooks) throws a non-`HTTPException` error. Each log now carries the subject `user_id`, the user's `connection`, the failing identifier in the description, and a `details` payload including the error name, stack trace, email/phone, and provider — so failures are queryable per user and the originating hook line is recoverable from logs. Behavior is unchanged: these errors are still swallowed and the operation continues. Hooks that need to abort must call `api.access.deny(...)` (registration) or throw `HTTPException` directly.
- 63bf3a9: Reject self-links (`linked_to === user_id`) at the user-update boundary and in the `POST /api/v2/users/:user_id/identities` management endpoint. Previously a self-link could be written through the `users.update` fast-path (single-field `linked_to` updates skip all hooks to avoid recursion) or through the link-identities endpoint, which had no check that `link_with !== user_id`. A user pointing `linked_to` at its own id makes the row simultaneously primary and secondary, corrupting identity resolution and list/get views.
- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
  - @authhero/adapter-interfaces@2.0.0
  - @authhero/widget@0.32.21

## 4.120.0

### Minor Changes

- 0539c2a: Move the Worker Loader code executor into `@authhero/cloudflare-adapter` and rename both Cloudflare code executors so the naming reflects which Cloudflare primitive each one uses.
  - New: `WorkerLoaderCodeExecutor` in `@authhero/cloudflare-adapter` — uses the Worker Loader binding to create isolates on the fly from in-memory code. Previously exported as `CloudflareCodeExecutor` from `authhero`.
  - Renamed: `CloudflareCodeExecutor` → `DispatchNamespaceCodeExecutor` in `@authhero/cloudflare-adapter` — uses a Workers for Platforms dispatch namespace and requires user code to be pre-deployed as worker scripts.
  - Deprecated alias: `CloudflareCodeExecutor` / `CloudflareCodeExecutorConfig` remain exported from `@authhero/cloudflare-adapter` as aliases of the dispatch-namespace executor, to be removed in the next major.
  - `authhero` no longer re-exports `CloudflareCodeExecutor`. Import the executor from `@authhero/cloudflare-adapter` instead. `LocalCodeExecutor` continues to be exported from `authhero` since it is platform-agnostic.

  Migration:

  ```ts
  // Before
  import { CloudflareCodeExecutor } from "authhero";
  const exec = new CloudflareCodeExecutor({ loader: env.LOADER });

  // After
  import { WorkerLoaderCodeExecutor } from "@authhero/cloudflare-adapter";
  const exec = new WorkerLoaderCodeExecutor({ loader: env.LOADER });
  ```

  In the same change, `globalOutbound: null` is removed from the Worker Loader executor's `WorkerCode`, so user actions can now make outbound `fetch()` calls (Slack webhooks, email APIs, etc.). The Worker Loader still provides v8-level isolation from the parent worker's bindings — this only widens the network boundary, not the host boundary. Previously, any `fetch()` from action code failed with _"This worker is not permitted to access the internet via global functions like fetch()"_.

### Patch Changes

- 0539c2a: Fix `POST /api/v2/actions/actions/:id/test` returning `Unknown trigger: post-login`. The endpoint now maps the Auth0-style `post-login` trigger id to the internal `post-user-login` before invoking the code executor, matching the mapping already applied by the trigger-bindings routes.
- 0539c2a: Gate the DCR consent tenant picker (`/u2/connect/select-tenant`) by Management API permission instead of bare org membership. The picker now only lists a child tenant when the consenting user holds `create:clients` on `urn:authhero:management` via a role scoped to that tenant's control-plane org. The control plane itself is never offered as a registration target, even if the user is a member of its self-org. Users with a global (non-org-scoped) role granting `admin:organizations` continue to bypass the membership check, mirroring `@authhero/multi-tenancy`'s provisioning escape hatch.
- 0539c2a: Fix management-api writes not invalidating the cache used by u2/auth-api/universal-login/saml. The management-api was always constructing its own `createInMemoryCache(...)` (and on every request), so cache-wrapper invalidation ran against an isolated empty cache while the other apps continued serving stale entries from the shared `config.dataAdapter.cache` for up to 300s. The most visible symptom was toggling client flags such as `hide_sign_up_disabled_error` or `disable_sign_ups` not taking effect on the login flow until the TTL aged out. Management-api now reuses `config.dataAdapter.cache` when provided so writes invalidate the same cache other apps read from, and the fallback in-memory adapter is hoisted out of the per-request middleware.
- 024222e: Fix OIDC connections with providers that require `client_secret_post` (e.g. JumpCloud) and accept arrays for the `aud` claim:
  - `PATCH /api/v2/connections/:id` now preserves existing secret fields (`client_secret`, `app_secret`, `twilio_token`) when the request body omits them, matching Auth0's "missing = keep existing" contract. GET responses strip these, so a read→edit→PATCH round-trip from the admin UI no longer silently wipes them.
  - The upstream OAuth2 token exchange in `ExtendedOAuth2Client` now handles both `client_secret_basic` and `client_secret_post` directly (instead of falling through to arctic for Basic) and surfaces the raw upstream response body in thrown errors so `invalid_client` failures from providers like JumpCloud are diagnosable from logs.
  - `idTokenSchema.aud` now accepts a string or an array of strings, per OIDC Core §2.

## 4.119.0

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

### Patch Changes

- 1ea694f: Fix `event.client` and other Auth0-shape fields being undefined inside post-user-login code hooks. The code-hook path was constructing a minimal `{ ctx, user, request, tenant }` event while the `ctx.env.hooks.onExecutePostLogin` path right above it was already building the full Auth0-compatible event (`client`, `connection`, `transaction`, `session`, `organization`, `authentication`, `authorization`, `stats`, `resource_server`). Both paths now share the same event, so user-authored actions can access `event.client.name`, `event.connection`, etc. — matching Auth0. Code hooks are now skipped when prerequisites (client/authParams/loginSession) aren't available, instead of running with a broken event.
- 1ea694f: Forward `login_hint` to the upstream IdP when Home Realm Discovery routes a login to an enterprise/social connection by email domain. The matched email is added as `login_hint` on the OAuth2/OIDC authorization URL (oauth2, oidc, google-oauth2, microsoft strategies), matching Auth0's HRD behavior so the upstream IdP can pre-fill the user identifier.
- 1ea694f: Strip secret fields (`client_secret`, `app_secret`, `twilio_token`) from connection responses on the management API (GET list, GET by id, POST, PATCH). Matches Auth0's contract: secrets are write-only — callers POST/PATCH to set them, and an omitted value means "keep existing".
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
  - @authhero/adapter-interfaces@1.19.0
  - @authhero/widget@0.32.20

## 4.118.0

### Minor Changes

- de79c2a: Connection callback URLs now match Auth0's default. Previously `getConnectionCallbackUrl` always returned `${env.ISSUER}callback` regardless of the request host. The fallback now returns `${customDomain ?? env.ISSUER}login/callback` — honoring custom domains and using Auth0's `/login/callback` path instead of the legacy `/callback`.

  Existing connections with the legacy `/callback` URL registered at the upstream IdP should be pinned by setting `options.callback_url` to the exact previously-implicit URL (e.g. `https://auth2.example.com/callback`) before deploying — otherwise the upstream IdP will reject the new redirect_uri. For inherited/control-plane connections this only needs to be set once on the control-plane row; child tenants pick it up via settings inheritance. The override is now editable in the react-admin connection form. The legacy `/callback` route remains mounted (deprecated) so pinned URLs keep working.

### Patch Changes

- e1c52f0: Align the `/api/v2/keys/signing*` management endpoints with Auth0's permission names. `GET /signing` and `GET /signing/{kid}` now require `read:signing_keys` (was `read:keys`), `POST /signing/rotate` requires `create:signing_keys` (was `create:keys`), and `PUT /signing/{kid}/revoke` requires `update:signing_keys` (was `update:keys`). The `auth:read` / `auth:write` super-scopes still grant access. Tokens minted against the old AuthHero-only names will need their permissions reissued; Auth0-style tokens that already carry `*:signing_keys` will now work where they previously returned 403.
- e1c52f0: Fix Cloudflare code hooks failing silently. `handleCodeHook` always passed `timeoutMs: 5000` to `codeExecutor.execute`, and `CloudflareCodeExecutor` threw on any `timeoutMs`/`cpuLimitMs` it didn't enforce. The throw escaped back to the post-login flow, where the catch logged only `"Failed to execute code hook: <hook_id>"` with no error detail — so every Cloudflare-deployed code hook failed without diagnostic. `CloudflareCodeExecutor` now accepts and ignores these params (they were unenforceable through the Worker Loader API anyway), and the FAILED_HOOK / FAILED_SIGNUP log entries in `post-user-login.ts`, `user-registration.ts`, and `codehooks.ts` now include the underlying error message and a `details` bag.
- e1c52f0: Hide HRD-only enterprise connections from the identifier screen's button row. Connections with `options.domain_aliases` configured are intended to be routed via email-domain matching (Home Realm Discovery), not shown as "Continue with X" buttons. The identifier screen now excludes any connection that has `domain_aliases` set, unless `show_as_button: true` is explicitly set on the connection. Matches Auth0's default behavior for enterprise connections.

## 4.117.0

### Minor Changes

- b0394ff: Remove the `/u/check-account` (and `/u2/check-account`) interstitial screen. When an existing session is found at `/authorize`, the auth flow now silently issues a new authorization response (Auth0-compatible SSO) instead of asking the user to confirm "continue as X".

  Callers that want to force a fresh login still have the same escape hatches:
  - `prompt=login`
  - `prompt=select_account` (treated as `prompt=login`; authhero is single-session per browser)
  - `screen_hint=login`

  The `check-account` route, screen definition, `CheckEmailPage` component, and locale strings have been removed.

### Patch Changes

- 47afa9e: Honor `theme.colors.primary_button_label` unconditionally instead of dropping it when its WCAG contrast against `primary_button` falls below 4.5. Previously, a tenant setting (e.g.) white text on a medium blue button was silently overridden by an auto-picked black, because the contrast ratio sat just under the AA threshold. The tenant's explicit choice now wins; the auto-picker only runs when no label is set.
- b221917: Screen-based universal login (`/u2/login/identifier`): apply Home Realm Discovery so an email whose domain matches a connection's `options.domain_aliases` is routed to that connection's IdP, matching the legacy `/u/` flow. Also replaced the "Email is not valid." message shown when no connection accepts the entered email with "User account does not exist" — the email itself is valid; the prior message was misleading.
- Updated dependencies [47afa9e]
  - @authhero/widget@0.32.19

## 4.116.0

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

- 2ea1664: Add OIDC Hybrid Flow support. `response_type` now accepts `code id_token`, `code token`, and `code id_token token` — the `/authorize` redirect returns a code in the same response as an `id_token` and/or `access_token` carried in the fragment (or via `response_mode=form_post`). The front-channel id_token includes `c_hash` (always) and `at_hash` (when an access_token is co-issued) per OIDC Core 3.3.2.11. Discovery's `response_types_supported` advertises the three new values, closing the Auth0 parity gap on hybrid response types. The new `oidcc-hybrid-certification-test-plan` is wired into the conformance runner.
- 2ea1664: Expose bundled prompt text defaults via `GET /api/v2/prompts/custom-text/defaults`. Optional `language` and `prompt` query parameters narrow the response. The endpoint returns the shipped locale strings as `{ prompt, language, custom_text }` entries so the admin UI can render placeholder values and discover which prompt/screen forms exist without inferring them from per-tenant overrides. This is an authhero extension; Auth0 has no equivalent endpoint.

  The react-admin custom-text editor now consumes this endpoint: opening an entry pre-populates every shipped field for the prompt/language pair, shows the bundled default as the input placeholder and as `helperText`, and renders fields that the tenant hasn't overridden so admins can see the full surface area at a glance.

### Patch Changes

- 2ea1664: Universal login identifier page: accept an unknown email when the client is configured for Auth0 lazy migration (a `strategy: "auth0"` source plus a `Username-Password-Authentication` connection with `import_mode: true`), so the password step can verify against upstream Auth0 and migrate the user instead of failing identifier validation with "Email is not valid." Also hide HRD-enabled connections (those with `options.domain_aliases`) from the social/enterprise button row by default — they're reached via email-domain routing, matching Auth0's behavior. An explicit `show_as_button: true` opts back in.
- Updated dependencies [2ea1664]
- Updated dependencies [2ea1664]
  - @authhero/adapter-interfaces@1.18.0
  - @authhero/widget@0.32.18

## 4.115.0

### Minor Changes

- 0c662c0: Add deployment history for actions and fix the runtime lookup that prevented Auth0-style actions from firing.
  - The post-login (and other code-hook) dispatcher previously only resolved code via the legacy `data.hookCode` table. Actions created through the Auth0-compatible `POST /api/v2/actions/actions` API live in `data.actions` and were silently skipped at runtime. `handleCodeHook` now resolves `code_id` from `data.actions` first and falls back to `data.hookCode`, so deployed actions bound to a trigger actually run.
  - New `actionVersions` adapter (kysely + stub for drizzle) plus a `2026-05-10` migration creating the `action_versions` table. A version row is snapshotted on every action create and on every `POST /api/v2/actions/actions/:id/deploy`, with the latest snapshot marked `deployed: true` and any prior versions cleared.
  - New management API routes: `GET /api/v2/actions/actions/:actionId/versions`, `GET /api/v2/actions/actions/:actionId/versions/:id`, and `POST /api/v2/actions/actions/:actionId/versions/:id/deploy` (rollback). Rollback re-deploys the rolled-back version's code via the configured `codeExecutor` and snapshots a new version row so history reflects the rollback.
  - Deleting an action now also removes its version history.

### Patch Changes

- Updated dependencies [0c662c0]
  - @authhero/adapter-interfaces@1.17.0
  - @authhero/widget@0.32.17

## 4.114.0

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

- 45f719e: Advertise `end_session_endpoint` in `/.well-known/openid-configuration` by default. The `/oidc/logout` route (OIDC RP-Initiated Logout 1.0) is fully implemented and spec-compliant, but discovery used to gate it behind an opt-in flag — meaning RPs that discovered endpoints couldn't find logout at all.

  The `oidc_logout.rp_logout_end_session_endpoint_discovery` tenant flag is now treated as opt-_out_: only `=== false` hides the endpoint from discovery. Existing tenants with the flag set to `true` are unaffected; existing tenants without the flag set will start advertising the endpoint (the route already worked — only its discoverability changes).

  `/v2/logout` is unchanged. RPs that hit it directly continue to work.

- 7dd280c: OIDC implicit-flow correctness fixes uncovered while wiring up the `oidcc-implicit-certification-test-plan`:
  - Use the IANA-canonical ordering for combined `response_type` values: `AuthorizationResponseType.TOKEN_ID_TOKEN` is now `"id_token token"` (was `"token id_token"`), and `/.well-known/openid-configuration` advertises `response_types_supported` in the canonical OIDC Core 3.2 order. The `/authorize` endpoint canonicalises the order of any incoming `response_type` before validation, so requests using either order continue to be accepted.
  - For clients with `auth0_conformant: false`, scope-driven claims are now included in the ID Token whenever an ID Token is issued at the authorization endpoint — i.e. for any `response_type` containing `id_token` (Implicit `id_token` / `id_token token`, Hybrid `code id_token` / `code id_token token`). Previously only the bare `id_token` response type qualified, which tripped the OIDF conformance check `VerifyScopesReturnedInAuthorizationEndpointIdToken` for `id_token token` flows.
  - The OIDC Core 5.4 scope-to-claim mapping (profile/email/address/phone) is now shared between the ID Token and `/userinfo` via a single `buildScopeClaims` helper. Previously the ID Token only emitted a 6-claim subset of profile (`name`, `given_name`, `family_name`, `nickname`, `picture`, `locale`) and skipped address/phone entirely, while `/userinfo` emitted the full set. The ID Token now matches `/userinfo`: `middle_name`, `preferred_username`, `profile`, `website`, `gender`, `birthdate`, `zoneinfo`, `updated_at`, `address`, `phone_number`, `phone_number_verified` are all included when the corresponding scope is requested and the user has the value set.
  - Silent-auth (`prompt=none`) responses now pick the URL fragment for any non-`code` response_type, not just `token` and `id_token token`. Previously a `prompt=none` request with `response_type=id_token` and no active session returned its `error=login_required` via the URL query, which the OIDF check `RejectErrorInUrlQuery` flags. Same predicate covers the silent-auth success path and is forward-compatible with hybrid response types.
  - `createAuthTokens` now falls back to looking up the session's `authenticated_at` to populate `auth_time` when the caller hasn't supplied one. Code-flow and silent-auth callers already compute it, but the universal-login implicit/hybrid path went straight from credential submission to `createAuthTokens` without that step, so `oidcc-max-age-1` failed for implicit with "auth_time claim is missing from the id_token, but it is required for a authentication where the max_age parameter was used".

- 7dd280c: When a request is resolved to a tenant via the host subdomain (e.g. `tenant.auth.example.com`), the tenant middleware now also sets `custom_domain` so issued tokens, the `/.well-known/openid-configuration` document, and other self-referencing URLs use the host the client actually called. If the request lands on the canonical `env.ISSUER` host the value is left unset to preserve byte-exact `iss` claims. The host-vs-ISSUER comparison is case-insensitive per RFC 3986 §3.2.2, while the original casing of the request's host header is preserved when `custom_domain` is set.
- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [45f719e]
  - @authhero/adapter-interfaces@1.16.0
  - @authhero/widget@0.32.16

## 4.113.0

### Minor Changes

- 639ab29: Add lazy-migration support from an upstream Auth0 tenant. Two flows are gated by the existing `connection.options.import_mode` flag (already part of the Auth0 connection schema):
  - **Password fallback** — when a `Username-Password-Authentication` connection has `import_mode: true`, password logins that miss locally (no user, or no matching hash) fall back to the upstream Auth0's password-realm grant. On success the user/profile is fetched from `/userinfo` and the bcrypt hash is stored locally so subsequent logins are served entirely from authhero. No M2M token required.
  - **Refresh-token proxy** — when a `strategy: "auth0"` connection has `import_mode: true`, refresh-token grant requests whose token doesn't match any local row are forwarded to the upstream `/oauth/token` and the response is relayed verbatim (rotation, error shapes, etc.). Existing Auth0 sessions keep working until the next interactive login migrates the user via the password-fallback path.

  Configuration uses standard `connections` records — no new tenant fields, no new management API routes. A new `Strategy.AUTH0 = "auth0"` value identifies the upstream-source connection (filtered out of the universal-login button list automatically). The connection's `options` re-uses existing fields: `token_endpoint`, `userinfo_endpoint`, `client_id`, `client_secret`, `import_mode`. The react-admin connection edit form gains a dedicated section for these fields when `strategy === "auth0"`.

### Patch Changes

- 639ab29: Match Auth0 on `GET /api/v2/emails/provider`: when no email provider is configured for the tenant, return 200 with an empty JSON object (`{}`) instead of 404. SDKs and admin UIs that follow Auth0 semantics no longer need to special-case authhero's 404 to render an empty edit form.
- Updated dependencies [639ab29]
  - @authhero/adapter-interfaces@1.15.0
  - @authhero/widget@0.32.15

## 4.112.0

### Minor Changes

- 85d1d06: Add `/login/callback` as the new path for the upstream connection callback. The existing `/callback` route continues to work but is now marked as deprecated in the OpenAPI spec.

  Connections can also override the redirect_uri sent to the upstream IdP via the new `options.callback_url` field. When set, the strategy uses that URL verbatim; when unset, it falls back to the legacy `${authUrl}callback`. This lets operators flip individual connections to `/login/callback` (or any other registered redirect URI) one at a time as they update each IdP's allowed redirect URIs — no big-bang migration required.

- 85d1d06: Add `MailgunEmailService`, a zero-dependency `EmailServiceAdapter` implementation that posts to the Mailgun HTTP API via `fetch`. Credentials shape (`api_key`, `domain`, `region: "eu" | null`) matches Auth0's Mailgun provider config, so existing Auth0 tenants can migrate without changing their stored values. Sends `template` + `h:X-Mailgun-Variables` so integrators can use Mailgun-side templates named after the auth flows (`auth-code`, `auth-password-reset`, `auth-link`, `auth-verify-email`, `auth-pre-signup-verification`); `html`/`text` are sent as fallback content.

### Patch Changes

- Updated dependencies [85d1d06]
  - @authhero/adapter-interfaces@1.14.0
  - @authhero/widget@0.32.14

## 4.111.0

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

- f41b85c: Verify signed Request Objects at `/authorize` (RFC 9101 / OIDC Core §6.1) and add support for `request_uri` (§6.2). Previously the `request=` JWT was decoded without checking its signature — any caller could forge claims and have them merged into the authorization request. That hole is now closed.

  Behaviour changes:
  - `request=` JWTs are signature-verified against the client's keys. `alg=none` (unsigned request objects) is rejected. HS256/HS384/HS512 verify against `client_secret`; RS*/ES* verify against the client's `registration_metadata.jwks` (inline) or `client_metadata.jwks_uri` (fetched). The verifier also enforces `iss == client_id` (when present), `aud` matching the OP issuer, and `exp`/`nbf` with 30s leeway.
  - `request_uri` is now accepted. The URL is fetched with an SSRF guard (https-only by default, blocks `localhost` and private/loopback/link-local IPv4 + IPv6 ranges, 5s timeout, 64 KiB body cap) and the JWT body runs through the same verifier.
  - Sending both `request` and `request_uri` is rejected with HTTP 400 per the spec.
  - Discovery now advertises `request_uri_parameter_supported: true` and adds `request_object_signing_alg_values_supported: ["RS256","RS384","RS512","ES256","ES384","ES512","HS256","HS384","HS512"]`.

  For tests/local development, set `ALLOW_PRIVATE_OUTBOUND_FETCH: true` on the env binding to relax the SSRF guard (allows `http://`, `localhost`, and private IPs).

- 3891832: Support EC signing keys (ES256/ES384/ES512) for ID and access tokens. The signing algorithm is now derived from the key material at issue time, so a tenant can swap its `jwt_signing` key from RSA to EC P-256/P-384/P-521 (via `createX509Certificate({ keyType: "EC-P-256" })`) without changing any other configuration. RSA keys continue to sign with RS256.

  Discovery now advertises `id_token_signing_alg_values_supported: ["RS256", "ES256", "ES384", "ES512"]`, and `/.well-known/jwks.json` publishes EC keys with the proper `kty`/`crv`/`x`/`y` members and an explicit `alg`. The exported `jwksSchema` no longer requires `n` and `e` (those are now optional, alongside the new EC fields), so consumers narrowing on `kty` before reading members may need a small adjustment.

  PS256/PS384/PS512 are not yet supported; they require an explicit per-key alg field and will follow in a subsequent change.

- edbd47b: `init({ userLinkingMode })` now also accepts a resolver function `({ tenant_id, client_id }) => "builtin" | "off"` (sync or async), so the built-in email-based account-linking path can be turned off for specific tenants without needing a per-client override on every client.

### Patch Changes

- Updated dependencies [e0cd449]
- Updated dependencies [86fe6e8]
- Updated dependencies [f41b85c]
- Updated dependencies [3891832]
  - @authhero/adapter-interfaces@1.13.0
  - @authhero/widget@0.32.13

## 4.110.0

### Minor Changes

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
- 3c41bac: Provision a `client_grants` row alongside the client when `audience` (and optionally `scope`) are passed to `POST /oidc/register`. The DCR endpoint now accepts an `audience` field (RFC 7591 extension), validates it against the tenant's resource servers, validates each scope is defined on that resource server, and creates the grant inside the same transaction as the client. `DELETE /oidc/register/:client_id` removes the client's grants alongside the soft-delete.

  The `/connect/start` consent flow accepts the same `audience` query param, validates it up front, surfaces the resource server's name on the consent screen ("For API: <name>"), and pre-binds `audience` into the IAT constraints so a user-initiated DCR call cannot widen what was consented to. This makes a fully self-service M2M client registration possible: the user clicks Connect → DCR creates client + grant → `client_credentials` at `/oauth/token` mints an access token with the granted scopes.

  `scope` without `audience` is now rejected at both `/connect/start` and `POST /oidc/register` (previously the scope round-tripped as metadata but produced no working permissions).

- 32aacc6: Enforce `client.grant_types` at `POST /oauth/token`. When a client has a non-empty `grant_types` list, requests using a grant type not in that list are rejected with `400 unauthorized_client` (RFC 6749 §5.2). Clients with an empty or undefined `grant_types` continue to work as before, so this is a back-compat opt-in: set the field on a client to start enforcing.

### Patch Changes

- 32aacc6: Fix `Missing required parameter: response_type` when the universal-login widget redirects to `/authorize?connection=X&state=Y` for social login.

  When `state` matches a non-terminal `loginSession`, `/authorize` now hydrates missing OAuth params (`response_type`, `redirect_uri`, `scope`, `audience`, `nonce`, `response_mode`, `code_challenge`, `code_challenge_method`, `prompt`, `max_age`, `acr_values`, `login_hint`, `ui_locales`, `organization`) from the session's stored `authParams` before validating. Query params still take precedence — only missing values are filled in. This matches Auth0's behavior of treating `state` as sufficient to identify an in-progress flow.

- 32aacc6: Add `default_client_id` to the tenant schema. `/connect/start` now prefers this client as the login_session anchor for tenant-level DCR consent flows, falling back to the first available client so a brand-new tenant can still bootstrap its first integration. Roughly analogous to Auth0's "Default App" / Global Client.
- Updated dependencies [32aacc6]
- Updated dependencies [a4e29bd]
- Updated dependencies [32aacc6]
- Updated dependencies [6e5762c]
- Updated dependencies [32aacc6]
  - @authhero/adapter-interfaces@1.12.0
  - @authhero/widget@0.32.12

## 4.109.0

### Minor Changes

- 21b0608: Add Auth0-style refresh-token rotation and at-rest hashing.
  - New wire format `rt_<lookup>.<secret>`. The `lookup` slice is indexed in `refresh_tokens.token_lookup`; only the SHA-256 of the secret is persisted in `token_hash`. Internal ULID `id` stays as the primary key.
  - New per-client config in `Client.refresh_token`: `rotation_type: "rotating" | "non-rotating"` (default `non-rotating`) and `leeway` seconds (default 30). Set `rotation_type: "rotating"` to opt a client into rotation.
  - Each rotation issues a fresh child sharing `family_id` with the parent. Re-presenting a rotated parent within `leeway` mints a sibling (concurrent-call tolerance); outside `leeway` it triggers reuse detection and revokes the entire family via the new `revokeFamily` adapter method.
  - Admin `DELETE /api/v2/refresh_tokens/:id` now also revokes the rest of the family.
  - Backwards compatible: legacy id-only refresh tokens keep working until `2026-06-05`. After that date a follow-up PR removes the legacy fallback.

- fba1359: Add pills to universal login
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
  - @authhero/widget@0.32.11

## 4.108.0

### Minor Changes

- a99f0ad: Implement OIDC RP-Initiated Logout 1.0 endpoint at `GET /oidc/logout`. Validates `id_token_hint` signature, enforces `client_id`/`aud` agreement, refuses unregistered `post_logout_redirect_uri`s, echoes `state` on the redirect, and atomically revokes the session + bound refresh tokens with `SUCCESS_LOGOUT` / `SUCCESS_REVOCATION` audit events. Renders a static signed-out page when no redirect URI is supplied.

### Patch Changes

- e5cbfe7: Allow `client_secret` and `code_verifier` in the same `grant_type=authorization_code` request, as required by OAuth 2.1 and recommended by RFC 7636 / RFC 9700 §2.1.1. The `/oauth/token` schema previously rejected the combination as a discriminated-union mismatch; both fields are now optional and validated independently — `client_secret` against the registered client, `code_verifier` against the stored `code_challenge`.
- 43c5276: Stop emitting a duplicate `SUCCESS_LOGIN` ("s") log on passwordless OTP completions with `response_type=code`. The canonical login event is owned by the post-login hook; the OTP-exchange event now only fires for the implicit flow, where /oauth/token is not called.
- e5cbfe7: Advertise `end_session_endpoint` in `/.well-known/openid-configuration` when the tenant flag `oidc_logout.rp_logout_end_session_endpoint_discovery` is enabled (off by default, matching Auth0). Required for OIDC RP-Initiated Logout. Also adds the optional `end_session_endpoint` field to the `openIDConfigurationSchema`.
- dd071e0: Add `Cache-Control: no-store` and `Pragma: no-cache` headers to the token endpoint response (per RFC 6749 §5.1) and advertise `grant_types_supported` in the OpenID Connect discovery document. Reject refresh-token exchanges where the refresh token's `client_id` does not match the authenticating client. Implement `POST /oauth/revoke` per RFC 7009 (refresh-token revocation, with `client_secret_basic` and `client_secret_post` client authentication).
- Updated dependencies [e5cbfe7]
- Updated dependencies [dd071e0]
  - @authhero/adapter-interfaces@1.10.3
  - @authhero/widget@0.32.10

## 4.107.0

### Minor Changes

- 6ddeedc: Fix issue with missing connection

### Patch Changes

- 3230b9b: Hook metadata bag + control-plane template inheritance.

  Adds a free-form `metadata: Record<string, unknown>` field to all hook variants (web, form, template, code), persisted as JSON in kysely + drizzle. Two well-known keys are defined:
  - `metadata.inheritable: true` — when set on a hook on the control-plane tenant, the multi-tenancy runtime fallback surfaces that hook on every sub-tenant's `hooks.list` and `hooks.get`. Inherited hooks are read-only from the sub-tenant's perspective: writes go through the base adapter's `tenant_id` WHERE clause and are silent no-ops on cross-tenant rows.
  - Template options. The dispatcher forwards `hook.metadata` to the template function. The `account-linking` template reads `metadata.copy_user_metadata: true` to merge the secondary user's `user_metadata` into the primary's on link (primary wins on key conflicts; `app_metadata` is never copied).

  Includes the kysely migration `2026-04-29T10:00:00_hooks_metadata` adding the `metadata` column.

- Updated dependencies [3230b9b]
  - @authhero/adapter-interfaces@1.10.2
  - @authhero/widget@0.32.9

## 4.106.1

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
  - @authhero/widget@0.32.8

## 4.106.0

### Minor Changes

- ba03e14: Drop `dcr_allowed_integration_types` tenant flag and per-tenant allowlist check on `/connect/start`. `integration_type` is now an optional free-form label — `enable_dynamic_client_registration` alone gates the connect flow. Existing callers that pass `integration_type` continue to work; the value still flows into the IAT constraints and consent screen when supplied.

### Patch Changes

- Updated dependencies [ba03e14]
  - @authhero/adapter-interfaces@1.10.0
  - @authhero/widget@0.32.7

## 4.105.0

### Minor Changes

- 078f2c6: Add control-plane mode to `/connect/start` so it can be used from a multi-tenancy control plane.

  Previously the consent flow always minted the IAT on whichever tenant the request resolved to. That meant integrators had to point `/connect/start` at each child tenant's host directly — there was no way to start the flow on a shared control-plane host (e.g. `auth2.sesamy.com`) and have the IAT land on the user's chosen workspace.

  The flow now branches based on the resolved tenant:
  - **Direct-to-child (unchanged):** request resolves to a child tenant → mint the IAT there. No new behavior.
  - **Control plane:** request resolves to the multi-tenancy control plane (detected via `data.multiTenancyConfig.controlPlaneTenantId`, set by `@authhero/multi-tenancy`'s `withRuntimeFallback`) → after login, the user is shown a new `/u2/connect/select-tenant` picker listing every organization they belong to on the control plane. Each organization name maps 1:1 to a child tenant id (the convention enforced by the provisioning hooks). The chosen child tenant is persisted on the login session and the IAT is minted against that tenant.

  Membership is re-validated when consent is submitted, so a stale or tampered `target_tenant_id` cannot be used to mint on a workspace the user has lost access to.

  When the IAT lives on a different tenant than the request resolved against, the success redirect adds `authhero_tenant=<child_tenant_id>` alongside `authhero_iat`. Pass it as the `tenant-id` header on `POST /oidc/register` so registration hits the correct tenant. Direct-to-child callers don't get this parameter.

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

### Patch Changes

- Updated dependencies [2578652]
  - @authhero/adapter-interfaces@1.9.0
  - @authhero/widget@0.32.6

## 4.104.0

### Minor Changes

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

- e595b83: Add rfc 7638 support
- 02cebf4: Add RFC 7591 Dynamic Client Registration and RFC 7592 Client Configuration endpoints with Initial Access Token support.
  - `POST /oidc/register` (RFC 7591 §3): create a client, optionally gated by an Initial Access Token (IAT). Open DCR can be enabled by setting `tenant.flags.dcr_require_initial_access_token = false`.
  - `GET/PUT/DELETE /oidc/register/:client_id` (RFC 7592): self-service client configuration using the registration access token returned at registration time.
  - New `client_registration_tokens` table (kysely + drizzle) holding both IATs and RATs with SHA-256 hashed storage.
  - New `clients` columns: `owner_user_id`, `registration_type`, `registration_metadata`.
  - New tenant flags: `dcr_require_initial_access_token`, `dcr_allowed_grant_types`.
  - Discovery (`.well-known/openid-configuration`) now only emits `registration_endpoint` when `flags.enable_dynamic_client_registration = true`.
  - RFC 7591 `redirect_uris` is mapped to/from AuthHero's internal `callbacks` field at the wire boundary — the Management API continues to use `callbacks` unchanged.

- e595b83: Derive signing-key `kid` from the RFC 7638 JWK Thumbprint.

  `createX509Certificate` now sets the `kid` (and the existing `fingerprint` field) to the SHA-256 base64url thumbprint of the public JWK, computed per RFC 7638 (only the required members for the kty, in lexicographic order, no whitespace). This produces a deterministic, self-verifying key identifier that any client can recompute from the published JWKS.

  Existing keys keep their original `kid` (a hex-encoded certificate serial number) — `kid` is stored on each row, so previously issued tokens continue to verify. Only newly created keys use the thumbprint format. Operators can normalise via `POST /api/v2/keys/signing/rotate`.

  A new exported `computeJWKThumbprint(jwk)` helper is available for any caller that needs to compute the thumbprint of an arbitrary JWK.

### Patch Changes

- ee8f683: Scope passkey authentication to the current tenant when the user is known. The "Log in with passkey" link on the login screen is hidden when the session's user has no passkey registered under the current tenant, and `allowCredentials` is populated on the passkey challenge and conditional-mediation flows so the browser/OS picker only offers credentials belonging to this tenant. This prevents cross-tenant passkey confusion when multiple tenants share the same auth host (same WebAuthn `rpId`).
- Updated dependencies [48eab09]
- Updated dependencies [02cebf4]
  - @authhero/adapter-interfaces@1.8.0
  - @authhero/widget@0.32.5

## 4.103.2

### Patch Changes

- 9145dbd: Preserve `user_id`, `audience`, and `scope` on outbox-delivered log entries. Previously, when `logMessage` was routed through the outbox (e.g., successful login via `post-user-login` hook), the `AuditEvent` → `LogInsert` transform dropped these fields: `actor.id` ignored `params.userId` in favor of only `ctx.var.user_id`, and `audience` was hardcoded to `""` because the `AuditEvent` schema lacked those fields.
  - Add optional `audience` and `scope` to `AuditEventInsert`.
  - `buildAuditEvent` now falls back `actor.id` to `params.userId`, sets `actor.type = "user"` for user-initiated events, and categorizes them as `"user_action"`.
  - `toLogInsert` maps `event.audience` and `event.scope` through to the log row.

- 9145dbd: Drop the multi-statement transaction from `refreshTokens.update`. The previous implementation ran UPDATE + SELECT + UPDATE inside `db.transaction()` to extend the parent `login_session` expiry, which on async HTTP drivers (PlanetScale, D1) meant three sequential round-trips plus BEGIN/COMMIT and held a row lock on `login_sessions` across the whole transaction — creating a hot-row hotspot when multiple refresh tokens shared a `login_id`.
  - Add optional `UpdateRefreshTokenOptions.loginSessionBump` to the adapter interface. The caller now provides `login_id` and the pre-computed new `expires_at`, so the adapter avoids a read-before-write.
  - `refreshTokens.update` issues the refresh-token and login-session UPDATEs concurrently via `Promise.all`, collapsing wall-clock latency to roughly one round-trip on async drivers. The bump is idempotent (`WHERE expires_at_ts < new`) and self-healing (next refresh re-bumps on a transient failure), so strict atomicity is not required.
  - Fix `ctx.req.header["x-real-ip"]` / `["user-agent"]` — Hono exposes `header` as a function, so bracket access has been silently writing empty strings to `device.last_ip` / `device.last_user_agent` since the grant landed. Use `ctx.req.header("x-real-ip")` and skip the `device` write entirely when IP and UA are unchanged.

- Updated dependencies [9145dbd]
- Updated dependencies [9145dbd]
  - @authhero/adapter-interfaces@1.7.0
  - @authhero/widget@0.32.4

## 4.103.1

### Patch Changes

- 6fecd2d: Fill gaps in audit/log emission across auth flows:
  - `/oauth/token` now emits success logs (`seacft`, `sertft`, `seccft`, `seotpft`) after tokens are minted, and failure logs (`fertft`, `feccft`, `feotpft`) on refresh-token, client-credentials, and passwordless-OTP exchange errors.
  - Universal-login passwordless flow emits `seotpft` after OTP validation.
  - `/u/validate-email` emits `sv` on success and `fv` on failure paths.
  - Account email-change verification emits `sce` after the new email is set.
  - Management API user deletion emits `sdu` alongside the existing `sapi` log.
  - Logout emits `srrt` when refresh tokens are revoked and `flo` on invalid redirect_uri.

- 2c3b543: Commit the `SUCCESS_REVOCATION` outbox event atomically with refresh-token removal and session revocation in the logout route. Adds a `logMessageInTx` helper for use inside `data.transaction()` callbacks so future auth flows can do the same.
- 7d9f138: Soft-revoke refresh tokens instead of hard-deleting them. Adds a `revoked_at` field to the `RefreshToken` schema, a `revokeByLoginSession(tenant_id, login_session_id, revoked_at)` adapter method, and a `refresh_tokens.revoked_at_ts` column. The logout route now issues a single bulk UPDATE (fixing a pagination bug where sessions with >100 refresh tokens were not fully revoked), and the refresh-token grant rejects revoked tokens with an `invalid_grant` error.
- 2c3b543: Fix regression where "no audience" errors were thrown when completing authentication. The authparams-refactor release removed the tenant-level audience fallback from token minting, but some loginSession creation paths (`/co/authenticate`, `/dbconnections`, passwordless error path) don't stamp audience upstream. Restore the `tenant.default_audience` fallback in `createAuthTokens` and `createRefreshToken`, and stamp `audience` at the remaining session creation sites.
- Updated dependencies [7d9f138]
  - @authhero/adapter-interfaces@1.6.0
  - @authhero/widget@0.32.3

## 4.103.0

### Minor Changes

- 0b3419b: Add `runOutboxRelay` — a one-call helper for draining the outbox from a cron / scheduled handler. Internally it builds the same destination array the inline dispatcher uses, mints per-tenant `auth-service` tokens via the same in-process path (`createServiceTokenCore`), and then runs `drainOutbox` followed by `cleanupOutbox`. Consumers no longer need to plumb `getServiceToken` themselves to sweep up `hook.*` events on a schedule.

  `createDefaultDestinations` now accepts an optional `webhookInvoker` of the same shape as the `init()` option. The inline per-request outbox dispatcher now honors `config.webhookInvoker` too, so cron-drained and per-request deliveries no longer diverge silently when a consumer supplies a custom invoker. All existing exports (`drainOutbox`, `cleanupOutbox`, `createDefaultDestinations`) keep their prior signatures; the new `webhookInvoker` field and `runOutboxRelay` export are additive.

- b4f4f15: Resolve the tenant `default_audience` at `/authorize` time and stamp it onto the `login_session` authParams, matching Auth0's behavior ("setting the Default Audience is equivalent to appending this audience to every authorization request"). Previously the fallback was applied at token issuance and incorrectly referenced `tenant.audience` (the tenant's own identifier) instead of `tenant.default_audience`. Downstream runtime fallbacks in `createFrontChannelAuthResponse`, `silentAuth`, and `createRefreshToken` have been removed — the audience flows through on the login session.

  Behavior change: tenants that were relying on the undocumented fallback to `tenant.audience` will now need `default_audience` set (or to pass `audience` explicitly) to mint access tokens without an audience. Changing the tenant `default_audience` no longer retroactively affects in-flight login sessions; it only applies to new `/authorize` requests.

## 4.102.0

### Minor Changes

- 31b0b62: Update the adapters

## 4.101.1

### Patch Changes

- 011928c: Fix: `hook.post-user-registration` (and other `hook.*`) outbox events enqueued from the universal-login apps (`/u/*` and `/u2/*`) were dead-lettering immediately with `No destination accepts event_type=hook.post-user-registration` — the two universal-login apps' `outboxMiddleware` was only wired with `LogsDestination`, which rejects `hook.*` events. Registration webhooks never fired for users created through the OTP / identifier screens.

  The universal-login apps now register the same destination list as auth-api and management-api (`LogsDestination` + `WebhookDestination` + `RegistrationFinalizerDestination`), so `hook.*` events enqueued on these routes are delivered and `registration_completed_at` is flipped on success.

## 4.101.0

### Minor Changes

- 931f598: Add `GET /authorize/resume` endpoint mirroring Auth0's terminal login-session resumption point.

  Sub-flows now persist the authenticated identity onto the login session (new `auth_strategy` and `authenticated_at` columns on `login_sessions`) and 302 the browser to `/authorize/resume?state=…`. The resume endpoint owns (a) hopping back to the original authorization host when the browser is on the wrong custom domain so the session cookie lands under the right wildcard, and (b) dispatching based on the login-session state machine to the final token/code issuance or to the next MFA/continuation screen.

  The social OAuth callback is migrated as the first consumer: the old 307-POST cross-domain re-dispatch in `connectionCallback` is replaced by a plain 302 to `/authorize/resume`, and the OAuth code exchange now always runs once on whichever host the provider called back to. Subsequent PRs will migrate the password / OTP / signup / SAML sub-flows to the same pattern, after which the ad-hoc `Set-Cookie` forwarding layers in Universal Login can be removed.

- 931f598: Export `createDefaultDestinations` so consumers can call `drainOutbox` from a cron / scheduled handler with the same destination set the in-request middleware uses.

  Previously the built-in `LogsDestination`, `WebhookDestination`, and `RegistrationFinalizerDestination` classes were private, so a consumer wanting to wire a cron-based outbox drain as a safety net would have had to reimplement all three to match the canonical hook.\* filtering, retry semantics, and post-registration finalization — and would drift any time authhero's internals changed. `createDefaultDestinations({ dataAdapter, getServiceToken })` returns the same array the per-request `outboxMiddleware` constructs, keeping the cron drain and the inline dispatcher in lock-step.

  The destination classes themselves (`LogsDestination`, `WebhookDestination`, `RegistrationFinalizerDestination`) and the `EventDestination` interface are also exported now for consumers who want to customize the set.

- 931f598: Add `GET /api/v2/users/{user_id}/logs` endpoint that returns log rows for the user and all of its linked secondary identities. Calling it with a secondary user_id returns 404, matching the convention used by the user PATCH endpoint.

  The react-admin user **Logs** tab now hits this endpoint, so it surfaces login activity from linked accounts (which the previous `q=user_id:…` query against `/logs` silently missed, since linked accounts are stored as separate user rows and each retains its own `user_id` on log entries).

### Patch Changes

- Updated dependencies [931f598]
  - @authhero/adapter-interfaces@1.5.0
  - @authhero/widget@0.32.2

## 4.100.0

### Minor Changes

- 5d350ff: Fix duplicate `post-user-registration` outbox events on a user's first login.

  `postUserLoginHook` previously re-enqueued a `post-user-registration` event on every successful login whose `registration_completed_at` was still null, as a "self-healing" recovery for dead-lettered events. The check couldn't distinguish "event is still pending in the outbox" from "event was lost" — so every first-time login produced a second duplicate event while the original was still waiting to drain. In tenants with a pre-user-registration hook that mutates the user (e.g. setting `app_metadata.strategy`), the two enqueues even captured different user payloads, confirming the same bug.

  Self-healing is removed from the login path. Delivery reliability for `post-user-registration` now belongs solely to the outbox (retry + dead-letter). Recovery of dead-lettered events is an explicit admin/cron responsibility and should no longer be tangled into the login path.

  Also fixes the race-loser branch in `linkUsersHook`: `instanceof HTTPException` silently fails when the adapter is bundled (class identity differs across module boundaries), so the existing race-catch never actually fired in production. Switched to a duck-typed `status === 409` check and surfaced the race-loser as a 409 from `createUserHooks`, which `getOrCreateUserByProvider` now catches and recovers so the losing login still completes without re-firing post-registration hooks.

- 5d350ff: Fix link user race

## 4.99.1

### Patch Changes

- 6503423: Fix `onExecutePreUserRegistration` (and all other `config.hooks`) not firing when a sub-app (`oauthApp`, `managementApp`, `universalApp`, `u2App`, `samlApp`) is mounted or served directly. `config.hooks` — along with `samlSigner`, `poweredByLogo`, `codeExecutor`, `webhookInvoker`, and `outbox` — was previously merged into `ctx.env` only by the outer `init()` app's middleware, so consumers who routed requests straight to a sub-app saw `ctx.env.hooks` stay `undefined` and the hook silently no-op. This surfaced most visibly as social-provider callbacks (Vipps, Google, etc.) creating a user row without invoking `onExecutePreUserRegistration` — no `api.access.deny`, no `api.user.setLinkedTo`, no consumer log — while email/password worked in setups that did go through the outer app.

  The fix extracts the config-merge logic into a reusable `applyConfigMiddleware(config)` and wires it into each sub-app's own middleware chain, so hooks and other config values are available regardless of how the app is mounted. Merging is idempotent when the outer app is also used.

- 6503423: Resolve `linked_to` in the refresh-token and authorization-code grants so tokens minted from a secondary (linked) user's credentials carry the primary user's `sub`. Previously only the password grant did this, leaving refresh tokens and session-resume flows issuing tokens in the secondary's name post-link.
- 6503423: Fix cleanup deleting `login_sessions` while child `refresh_tokens` are still valid.

  `refreshTokens.create` and `refreshTokens.update` now extend the parent
  `login_sessions.expires_at_ts` to match the refresh token's longest expiry, in
  the same DB transaction. Previously the initial token exchange never bumped
  the login_session, so cleanup could delete the parent while its refresh tokens
  were still valid.

## 4.99.0

### Minor Changes

- b5f73bb: Expose cron-style helpers for scheduled handlers: `drainOutbox`, `cleanupOutbox`, and a context-free `cleanupSessions`. These can be wired directly into a Cloudflare Worker `scheduled()` handler (or any cron) to process pending outbox events and delete events past the retention window.
- b5f73bb: Add drain outbox

### Patch Changes

- 1d15292: Hide `registration_completed_at` from management API responses and hook payloads. The field is internal — used only by the self-healing post-user-registration re-enqueue logic — and is now stripped from `auth0UserResponseSchema`, the `GET/PATCH /users/:user_id` responses, all webhook bodies (via `invokeHooks`), the outbox `target.after` payload, and the `onExecutePostLogin` / `onExecutePreUserUpdate` / `onExecutePre|PostUserDeletion` event objects.
- Updated dependencies [1d15292]
  - @authhero/adapter-interfaces@1.4.1
  - @authhero/widget@0.32.1

## 4.98.0

### Minor Changes

- d288b62: Add support for dynamic workers

### Patch Changes

- Updated dependencies [d288b62]
  - @authhero/widget@0.32.0

## 4.97.0

### Minor Changes

- d84cb2f: Complete the transaction fixes

### Patch Changes

- Updated dependencies [d84cb2f]
  - @authhero/adapter-interfaces@1.4.0
  - @authhero/widget@0.31.4

## 4.96.0

### Minor Changes

- 2f6354d: Make session lifetime cofigurable
- 2f6354d: Fix mfa view for phone numbers

### Patch Changes

- Updated dependencies [2f6354d]
  - @authhero/adapter-interfaces@1.3.0
  - @authhero/widget@0.31.3

## 4.95.0

### Minor Changes

- d9415a0: Fix screen hint and passkeys mfa

### Patch Changes

- d9415a0: Honor `screen_hint=login` on `/authorize` to skip the check-account screen when an existing session is present, sending the user directly to the login/identifier page instead.

## 4.94.0

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
  - @authhero/widget@0.31.2

## 4.93.0

### Minor Changes

- 3da602c: Trim transactions

### Patch Changes

- Updated dependencies [3da602c]
  - @authhero/adapter-interfaces@1.1.0
  - @authhero/widget@0.31.1

## 4.92.0

### Minor Changes

- 7e0b2cb: Fix mfa security issues

## 4.91.0

### Minor Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

### Patch Changes

- Updated dependencies [20d5140]
  - @authhero/adapter-interfaces@1.0.0
  - @authhero/widget@0.31.0

## 4.90.0

### Minor Changes

- 9b0da44: Add transaction for linking of users
- 18b50b9: Send reset password code
- 71b17f7: Fix enroll passkey

## 4.89.0

### Minor Changes

- 37eee72: Add support for screen_hint signup
- a59a49b: Implement disable-sso
- 4176937: Handle outbox messages and update universal auth

### Patch Changes

- Updated dependencies [a59a49b]
- Updated dependencies [4176937]
  - @authhero/adapter-interfaces@0.155.0
  - @authhero/widget@0.30.0

## 4.88.0

### Minor Changes

- fa7ce07: Updates for passkeys login

### Patch Changes

- Updated dependencies [fa7ce07]
  - @authhero/adapter-interfaces@0.154.0
  - @authhero/widget@0.29.2

## 4.87.0

### Minor Changes

- 77b7c76: Add outbox middleware

## 4.86.0

### Minor Changes

- 884e950: Update outbox

### Patch Changes

- Updated dependencies [884e950]
  - @authhero/adapter-interfaces@0.153.0
  - @authhero/widget@0.29.1

## 4.85.0

### Minor Changes

- 2f65572: Fix nested transactions
- 76f2b7f: Fix paging of clients in react-admin

## 4.84.0

### Minor Changes

- 885eeeb: Fix passkeys

### Patch Changes

- Updated dependencies [885eeeb]
  - @authhero/widget@0.29.0

## 4.83.0

### Minor Changes

- e8336c3: Add passkeys to the account page

## 4.82.0

### Minor Changes

- f3b910c: Add outbox pattern

### Patch Changes

- Updated dependencies [f3b910c]
  - @authhero/adapter-interfaces@0.152.0
  - @authhero/widget@0.28.2

## 4.81.0

### Minor Changes

- 4e95762: Support organizations for refresh tokens
- 5a51e9f: Add deny for pre register event

## 4.80.0

### Minor Changes

- 3e74dea: Update handling of host headers
- 022f12f: Move email and sms to adapters

### Patch Changes

- Updated dependencies [3e74dea]
- Updated dependencies [022f12f]
  - @authhero/adapter-interfaces@0.151.0
  - @authhero/widget@0.28.1

## 4.79.0

### Minor Changes

- 50685fd: Use custom domains for openid-configuration

## 4.78.0

### Minor Changes

- adfc437: Add passkeys login

## 4.77.0

### Minor Changes

- 164fe2c: Added passkeys

### Patch Changes

- Updated dependencies [164fe2c]
  - @authhero/adapter-interfaces@0.150.0
  - @authhero/widget@0.28.0

## 4.76.0

### Minor Changes

- 7c52f88: Fix setup guide bugs

### Patch Changes

- Updated dependencies [7c52f88]
  - @authhero/widget@0.27.0

## 4.75.0

### Minor Changes

- b3ad21f: Update setup with new ui

## 4.74.0

### Minor Changes

- c862e9f: Add footer to u2 routes and fix docker build

### Patch Changes

- Updated dependencies [c862e9f]
  - @authhero/widget@0.26.0

## 4.73.0

### Minor Changes

- f4557c1: Fix the topt enrollment
- 8286a6a: Add a setup UI

### Patch Changes

- Updated dependencies [f4557c1]
  - @authhero/widget@0.25.0

## 4.72.0

### Minor Changes

- d9c2ad1: Fixes to mfa-signup and new account screens
- bd094f0: Add vary header for origin

### Patch Changes

- Updated dependencies [d9c2ad1]
  - @authhero/widget@0.24.0

## 4.71.0

### Minor Changes

- db01903: Add a robots.txt file

## 4.70.0

### Minor Changes

- 6e6b8cb: Add totp for 2fa

## 4.69.0

### Minor Changes

- 64e858a: Add mfa with logging

### Patch Changes

- Updated dependencies [64e858a]
  - @authhero/adapter-interfaces@0.149.0
  - @authhero/widget@0.23.0

## 4.68.0

### Minor Changes

- 469c395: Language refactor

### Patch Changes

- Updated dependencies [469c395]
  - @authhero/adapter-interfaces@0.148.0
  - @authhero/widget@0.22.0

## 4.67.0

### Minor Changes

- 5e73f56: Remove magic strings
- 5e73f56: Replace magic strings

### Patch Changes

- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
  - @authhero/adapter-interfaces@0.147.0
  - @authhero/widget@0.21.0

## 4.66.0

### Minor Changes

- 318fcf9: Update widget links
- 318fcf9: Update widget links

### Patch Changes

- Updated dependencies [409aa18]
- Updated dependencies [318fcf9]
- Updated dependencies [318fcf9]
  - @authhero/widget@0.20.0
  - @authhero/adapter-interfaces@0.146.0

## 4.65.0

### Minor Changes

- 809a9b1: Fix double wrapping of hooks
- 2d69ec6: Fix email account linking

## 4.64.0

### Minor Changes

- fddedad: Fix darkmode persistence

## 4.63.0

### Minor Changes

- 30b5be1: Add support for set_user_root_attributes

### Patch Changes

- Updated dependencies [30b5be1]
  - @authhero/adapter-interfaces@0.145.0
  - @authhero/widget@0.19.2

## 4.62.0

### Minor Changes

- e006fce: Set connection for onExecuteValidateRegistrationUsername

## 4.61.0

### Minor Changes

- 3d1af41: Set connection on login_sessions
- b999582: Add a error page and fix a callback url port issue

## 4.60.0

### Minor Changes

- dcbd1d7: Store the used connection on the login_session

### Patch Changes

- Updated dependencies [dcbd1d7]
  - @authhero/adapter-interfaces@0.144.0
  - @authhero/widget@0.19.1

## 4.59.0

### Minor Changes

- 39df1aa: Pass connection in credentials event
- 39df1aa: Update styling of error messages
- 39df1aa: Change url of enter-code page

### Patch Changes

- Updated dependencies [39df1aa]
  - @authhero/adapter-interfaces@0.143.0
  - @authhero/widget@0.19.0

## 4.58.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

### Patch Changes

- Updated dependencies [1a72b93]
  - @authhero/adapter-interfaces@0.142.0
  - @authhero/widget@0.18.0

## 4.57.0

### Minor Changes

- c5b14e4: Pass the error correctly on callback from oidc login

## 4.56.0

### Minor Changes

- 4a207af: Redirect to correct version of ui

## 4.55.0

### Minor Changes

- 3de697d: Add support for http validation of domains

### Patch Changes

- Updated dependencies [3de697d]
  - @authhero/adapter-interfaces@0.141.0
  - @authhero/widget@0.17.2

## 4.54.0

### Minor Changes

- 9125101: Fix the screen name
- 3b61167: Set login session state for impersonation

## 4.53.0

### Minor Changes

- c7c8770: Update expire_at_ts for login_sesssions
- 38d5be2: Update login_sessions expire

## 4.52.0

### Minor Changes

- 7154fe1: Update refresh-tokens schema

### Patch Changes

- Updated dependencies [7154fe1]
  - @authhero/adapter-interfaces@0.140.0
  - @authhero/widget@0.17.1

## 4.51.0

### Minor Changes

- 2617efb: Update stylig for widget

### Patch Changes

- Updated dependencies [2617efb]
  - @authhero/adapter-interfaces@0.139.0
  - @authhero/widget@0.16.0

## 4.50.0

### Minor Changes

- 8b49a84: Add custom claims to service tokens

## 4.49.0

### Minor Changes

- 192f480: First step in refresh tokens refactor

### Patch Changes

- Updated dependencies [192f480]
  - @authhero/adapter-interfaces@0.138.0
  - @authhero/widget@0.15.3

## 4.48.0

### Minor Changes

- 945b9e2: Fix issues with how the hooks were fetched

## 4.47.0

### Minor Changes

- 8d348ab: Expose a webhook invoker

## 4.46.0

### Minor Changes

- 553ada7: Improve logging of failed hooks

## 4.45.0

### Minor Changes

- 818846d: Change to use auth0 instead of auth2
- 6476145: Use username from linked identities

## 4.44.0

### Minor Changes

- 897ca72: Use username as default for create-authhero
- 0719de4: Add username to indetifier array

### Patch Changes

- Updated dependencies [0719de4]
  - @authhero/adapter-interfaces@0.137.0
  - @authhero/widget@0.15.2

## 4.43.0

### Minor Changes

- d7bcd19: Add hook templates

### Patch Changes

- Updated dependencies [d7bcd19]
  - @authhero/adapter-interfaces@0.136.0
  - @authhero/widget@0.15.1

## 4.42.0

### Minor Changes

- 65321b7: Update for forms, flows and u2 login

### Patch Changes

- Updated dependencies [65321b7]
  - @authhero/adapter-interfaces@0.135.0
  - @authhero/widget@0.15.0

## 4.41.0

### Minor Changes

- de5974b: Update u2 login and flows
- ded42c0: Unlink the linked users on delete

## 4.40.0

### Minor Changes

- 00e9cf7: Add support for forms in the u2 login

### Patch Changes

- Updated dependencies [00e9cf7]
  - @authhero/widget@0.14.0

## 4.39.0

### Minor Changes

- 8c38b8f: Update reset password

## 4.38.0

### Minor Changes

- a5c1ba9: Add mfa signup

### Patch Changes

- Updated dependencies [a5c1ba9]
  - @authhero/adapter-interfaces@0.134.0
  - @authhero/widget@0.13.3

## 4.37.0

### Minor Changes

- 2e08bfa: Add support for password first

## 4.36.0

### Minor Changes

- 5d759c1: Add a u2 form for reset password

## 4.35.1

### Patch Changes

- Updated dependencies [7adc7dc]
  - @authhero/adapter-interfaces@0.133.0
  - @authhero/widget@0.13.2

## 4.35.0

### Minor Changes

- cd5fdc4: Update the routing for widget
- 0ccab18: Update caching
- 9cf179a: Update events for account linking

## 4.34.0

### Minor Changes

- 131ea43: Add more node fields

### Patch Changes

- Updated dependencies [131ea43]
  - @authhero/adapter-interfaces@0.132.0
  - @authhero/widget@0.13.1

## 4.33.0

### Minor Changes

- ff4fe46: Handle custom domains for widget

## 4.32.0

### Minor Changes

- c5935bd: Update the new widget endpoints

### Patch Changes

- Updated dependencies [c5935bd]
  - @authhero/adapter-interfaces@0.131.0
  - @authhero/widget@0.13.0

## 4.31.0

### Minor Changes

- 0a5816a: Update the parts for styling of social buttons

### Patch Changes

- Updated dependencies [0a5816a]
  - @authhero/widget@0.12.0

## 4.30.0

### Minor Changes

- bf22ac7: Add support for inlang

### Patch Changes

- Updated dependencies [bf22ac7]
  - @authhero/widget@0.11.0

## 4.29.0

### Minor Changes

- 44b76d9: Update the custom text behaviour

### Patch Changes

- Updated dependencies [44b76d9]
  - @authhero/widget@0.10.0

## 4.28.0

### Minor Changes

- 88a03cd: Add ssr for widget
- ac8af37: Add custom text support

### Patch Changes

- Updated dependencies [88a03cd]
- Updated dependencies [ac8af37]
  - @authhero/widget@0.9.0
  - @authhero/adapter-interfaces@0.130.0

## 4.27.0

### Minor Changes

- a8e70e6: Fix fallbacks for sms service options
- a8e70e6: Update schemas to remove old fallbacks

### Patch Changes

- Updated dependencies [a8e70e6]
  - @authhero/adapter-interfaces@0.129.0

## 4.26.0

### Minor Changes

- f0fc1a0: Render themes and branding for widget

## 4.25.0

### Minor Changes

- e7f5ce5: Fix the universal-login-template in kysley

## 4.24.0

### Minor Changes

- 6585906: Move universal login templates to separate adapter

### Patch Changes

- Updated dependencies [6585906]
  - @authhero/adapter-interfaces@0.128.0

## 4.23.0

### Minor Changes

- fd374a9: Set theme id
- 8150432: Replaced legacy client

### Patch Changes

- Updated dependencies [fd374a9]
- Updated dependencies [8150432]
  - @authhero/adapter-interfaces@0.127.0

## 4.22.0

### Minor Changes

- de7cb56: Filter out revoked sessions
- 154993d: Improve react-admin experience by clearing caches and setting cores

### Patch Changes

- Updated dependencies [154993d]
  - @authhero/adapter-interfaces@0.126.0

## 4.21.0

### Minor Changes

- 491842a: Bump packages to make sure the universal_login_templates is available

### Patch Changes

- Updated dependencies [491842a]
  - @authhero/adapter-interfaces@0.125.0

## 4.20.0

### Minor Changes

- 2af900c: Create a per user session cleanup
- 2be02f8: Add dynamic liquid templates
- 2af900c: Update guids to ulids

### Patch Changes

- Updated dependencies [2af900c]
- Updated dependencies [2be02f8]
  - @authhero/adapter-interfaces@0.124.0

## 4.19.0

### Minor Changes

- d979690: Update the widget embed functionality

## 4.18.0

### Minor Changes

- 147462f: Fix logouts for custom domains

## 4.17.0

### Minor Changes

- 9e7e36d: Handle multiple cookies
- c0792f6: Fix trailings slashes in redirect url

## 4.16.0

### Minor Changes

- f44bcd8: Temporary fix for move to partitioned cookies

## 4.15.0

### Minor Changes

- 2d0a7f4: Add a auth0-conformance flag

### Patch Changes

- Updated dependencies [2d0a7f4]
  - @authhero/adapter-interfaces@0.123.0

## 4.14.0

### Minor Changes

- 6f09503: Add favicon support to ui

## 4.13.0

### Minor Changes

- 8b9cb85: First passing openid test
- 16d21c8: Add paritioned cookies

## 4.12.0

### Minor Changes

- 5519225: Patch the scopes for client credentials
- 829afab: Hide sensistive info in management api
- 76510cd: Fixes for branding page and endpoint

## 4.11.0

### Minor Changes

- be0ac26: Fixed and issue with email users not being logged in after form hook

## 4.10.0

### Minor Changes

- a5f451a: Update the state logic for the continue endpoint
- 2cb9fc0: Fix the social links in the login-widget
- 2cb9fc0: Add a powered-by logo

## 4.9.1

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0

## 4.9.0

### Minor Changes

- e005714: Remove the complete login session

## 4.8.0

### Minor Changes

- 2853db0: Only show the selected connections for a client
- 8315e5c: Add the continue endpoint
- a98dbc4: Update scopes and permissions for client credentials
- 58ca131: Add cors for the screens endpoints

### Patch Changes

- Updated dependencies [2853db0]
- Updated dependencies [967d470]
  - @authhero/adapter-interfaces@0.121.0

## 4.7.0

### Minor Changes

- 7277798: Improve logging for changing emails

## 4.6.0

### Minor Changes

- 00d2f83: Update versions to get latest build
- edcb62d: Fix a state bug in the login flow

### Patch Changes

- Updated dependencies [00d2f83]
  - @authhero/adapter-interfaces@0.120.0

## 4.5.0

### Minor Changes

- 5ecc8ad: Add impersonation in stencil component
- 26fe324: Fix the awaiting continuation

## 4.4.1

### Patch Changes

- Updated dependencies [8ab8c0b]
  - @authhero/adapter-interfaces@0.119.0

## 4.4.0

### Minor Changes

- 58634b0: Expose all hooks

## 4.3.0

### Minor Changes

- 1c69d08: Fix userinfo hook

## 4.2.0

### Minor Changes

- 742ef7c: Add tenant-id to token

## 4.1.0

### Minor Changes

- fb3b47e: Remove hard coded control-plane tenant id

## 4.0.0

### Major Changes

- 3d3fcc0: Move logic over to multi-tenancy

### Minor Changes

- 3d3fcc0: Migrate connections

## 3.6.0

### Minor Changes

- b7bb663: Make organizations lowercase

### Patch Changes

- Updated dependencies [b7bb663]
  - @authhero/adapter-interfaces@0.118.0

## 3.5.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0

## 3.4.0

### Minor Changes

- 47fe928: Refactor create authhero
- f4b74e7: Add widget to react-admin
- b6d3411: Add a hono demo for the widget

## 3.3.0

### Minor Changes

- 71b01a6: Move authhero to peer dependency

## 3.2.0

### Minor Changes

- 9c15354: Remove shadcn and updated widget

### Patch Changes

- Updated dependencies [9c15354]
  - @authhero/adapter-interfaces@0.116.0

## 3.1.0

### Minor Changes

- 63e4ecb: Use assets folder
- 8858622: Move fallbacks to multi-tenancy package

## 3.0.0

### Patch Changes

- Updated dependencies [8e9a085]
  - @authhero/widget@0.4.0

## 2.0.0

### Patch Changes

- Updated dependencies [23c06fc]
  - @authhero/widget@0.3.0

## 1.4.0

### Minor Changes

- 928d358: Add userinfo hook

## 1.3.0

### Minor Changes

- f738edf: Add checkpoint pagination for organizations

### Patch Changes

- Updated dependencies [f738edf]
  - @authhero/adapter-interfaces@0.115.0
  - @authhero/widget@0.2.2

## 1.2.0

### Minor Changes

- c8c83e3: Add a admin:organizations permission to hande organizations in the control_plane

## 1.1.0

### Minor Changes

- 17d73eb: Change name of organization flag and add OR support in lucence queries
- e542773: Fixes for syncing resources servers and global roles

### Patch Changes

- Updated dependencies [17d73eb]
- Updated dependencies [e542773]
  - @authhero/adapter-interfaces@0.114.0
  - @authhero/widget@0.2.1

## 1.0.0

### Minor Changes

- d967833: Add a stencil-js widget for login

### Patch Changes

- Updated dependencies [d967833]
  - @authhero/adapter-interfaces@0.113.0
  - @authhero/widget@0.2.0

## 0.309.0

### Minor Changes

- aaf0aa0: Fix paging issue for scopes
- aaf0aa0: Update permissions casing

## 0.308.0

### Minor Changes

- bbe5492: Add real scopes

## 0.307.0

### Minor Changes

- 63f9c89: Remove requirement for password users to have verified emails

## 0.306.0

### Minor Changes

- 0f8e4e8: Change from main to control plane
- 3a180df: Fix organization names for main tenant

## 0.305.0

### Minor Changes

- aba8ef9: Handle org tokens for the main tenant

## 0.304.0

### Minor Changes

- 1c36752: Use org tokens for tenants in admin

## 0.303.0

### Minor Changes

- b778aed: Seed mananagement roles and create organizations

## 0.302.0

### Minor Changes

- 283daf2: Refactor multi-tenancy package
- ae8553a: Add is_system to all adapters

### Patch Changes

- Updated dependencies [ae8553a]
  - @authhero/adapter-interfaces@0.112.0

## 0.301.0

### Minor Changes

- e87ab70: Move tenants crud to multi-tenancy package

## 0.300.0

### Minor Changes

- 100b1bd: Patch the redirect action for flows

## 0.299.0

### Minor Changes

- 9e34783: Sync resource servers for multi tenancy setup

## 0.298.0

### Minor Changes

- 02567cd: Make create authhero work with d1 locally
- 906337d: Add flows support
- f3f96df: Add support for entity hooks

### Patch Changes

- Updated dependencies [906337d]
  - @authhero/adapter-interfaces@0.111.0

## 0.297.0

### Minor Changes

- a108525: Add flows

### Patch Changes

- Updated dependencies [a108525]
  - @authhero/adapter-interfaces@0.110.0

## 0.296.0

### Minor Changes

- 49d5eb8: Handle email change of linked accounts
- 49d5eb8: Handle disable signups in social flows
- 1bec131: Add stats endpoints and activity view

### Patch Changes

- Updated dependencies [1bec131]
  - @authhero/adapter-interfaces@0.109.0

## 0.295.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

## 0.294.0

### Minor Changes

- 6929f98: Improve the create authhero for local

## 0.293.0

### Minor Changes

- 85b58c4: Update the scripts and the logic in the identifier page

## 0.292.0

### Minor Changes

- 973a72e: Clear invalid session cookies

## 0.291.2

### Patch Changes

- Updated dependencies [0e906aa]
  - @authhero/adapter-interfaces@0.108.0

## 0.291.1

### Patch Changes

- Updated dependencies [212f5c6]
  - @authhero/adapter-interfaces@0.107.0

## 0.291.0

### Minor Changes

- 5ed04e5: Add forms router support

## 0.290.1

### Patch Changes

- Updated dependencies [f37644f]
  - @authhero/adapter-interfaces@0.106.0

## 0.290.0

### Minor Changes

- 40caf1a: Add support for different connections for different clients. And support sorting.

### Patch Changes

- Updated dependencies [40caf1a]
  - @authhero/adapter-interfaces@0.105.0

## 0.289.0

### Minor Changes

- 125dbb9: Flow updates

### Patch Changes

- Updated dependencies [125dbb9]
  - @authhero/adapter-interfaces@0.104.0

## 0.288.0

### Minor Changes

- c51ab9b: Fetch settings from connection

## 0.287.0

### Minor Changes

- b0c4421: Add oidc and icon_url
- c96d83b: Added dispaly name on connections

### Patch Changes

- Updated dependencies [b0c4421]
- Updated dependencies [c96d83b]
  - @authhero/adapter-interfaces@0.103.0

## 0.286.0

### Minor Changes

- 65db836: Update logging to kysely

## 0.285.0

### Minor Changes

- e04bae4: Update the logging handle geoip correctly

## 0.284.0

### Minor Changes

- 6952865: Handle undefined adapters

## 0.283.0

### Minor Changes

- 0566155: Get provider from connection

### Patch Changes

- Updated dependencies [0566155]
- Updated dependencies [0566155]
  - @authhero/adapter-interfaces@0.102.0

## 0.282.0

### Minor Changes

- 8ab05b4: Add multi-tenancy package

## 0.281.0

### Minor Changes

- 165addf: Update how scopes work for refresh tokens

## 0.280.0

### Minor Changes

- 8c373f0: Change to return 400 for refresh token error code

## 0.279.0

### Minor Changes

- 84f7b60: Change id of passwords to use nanoid

## 0.278.0

### Minor Changes

- 9d92786: Fix password reset

## 0.277.0

### Minor Changes

- 584871c: Add more logging for refresh token flow

## 0.276.0

### Minor Changes

- 0ffb5ca: Add support for password strength

### Patch Changes

- Updated dependencies [0ffb5ca]
  - @authhero/adapter-interfaces@0.101.0

## 0.275.0

### Minor Changes

- d381383: Moved failed invalid passwords up in the flow

## 0.274.0

### Minor Changes

- 3a0d8ee: Add geo info

### Patch Changes

- Updated dependencies [3a0d8ee]
  - @authhero/adapter-interfaces@0.100.0

## 0.273.0

### Minor Changes

- 79680de: Enforce audience with fallback to tenant default and embedded browser detection.
- 79680de: Enforce audience
- 29192de: Add warning for embedded browsers

## 0.272.0

### Minor Changes

- 745a032: Fix show password

## 0.271.0

### Minor Changes

- a0dd349: Fix permissions for client credentials flow

## 0.270.0

### Minor Changes

- 7f8ac8e: Add a incognito warning message

## 0.269.0

### Minor Changes

- fa14193: Store failed passwords in the app_metadata

## 0.268.0

### Minor Changes

- 9c24bcb: Set permissions for client credentials when rbac is enabled

## 0.267.0

### Minor Changes

- 251c143: Add logs for reset password

## 0.266.0

### Minor Changes

- edc006c: Fix the impersonate flow with password

## 0.265.1

### Patch Changes

- Updated dependencies [a3c69f0]
  - @authhero/adapter-interfaces@0.99.0

## 0.265.0

### Minor Changes

- a96d5ef: Handle client secret for refresh tokens

## 0.264.0

### Minor Changes

- 6067f00: Update the hook names

### Patch Changes

- Updated dependencies [6067f00]
  - @authhero/adapter-interfaces@0.98.0

## 0.263.0

### Minor Changes

- 3ae077b: ValidateSignupEmail hook

## 0.262.0

### Minor Changes

- Check for password identity on login

## 0.261.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.97.0

## 0.261.0

### Minor Changes

- Fix account linking for created password accounts

## 0.260.0

### Minor Changes

- Use authorization type form authorize request when impersonating

## 0.259.0

### Minor Changes

- Change errors to return json

## 0.258.0

### Minor Changes

- Move pre signup hook

## 0.257.0

### Minor Changes

- Add tenant id to var if there is a bearer token

## 0.256.0

### Minor Changes

- Added invites

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.96.0

## 0.255.1

### Patch Changes

- Updated dependencies
  - @authhero/saml@0.3.0

## 0.255.0

### Minor Changes

- Add act claim to token

## 0.254.0

### Minor Changes

- pnpm chnageset version

## 0.253.0

### Minor Changes

- Fix the password when creating a new user

## 0.252.0

### Minor Changes

- e52a74e: Move saml to separate package

### Patch Changes

- Updated dependencies [e52a74e]
  - @authhero/saml@0.2.0

## 0.251.0

### Minor Changes

- Pass language to email

## 0.250.0

### Minor Changes

- Update the logo and language for sending emails

## 0.249.0

### Minor Changes

- Add failed token exchange logs

## 0.248.0

### Minor Changes

- Merge settings and tenants table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.95.0

## 0.247.0

### Minor Changes

- Add settings endpoint
- Refactor strategies

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.94.0

## 0.246.0

### Minor Changes

- Fix the code form

## 0.245.0

### Minor Changes

- Fix id-token org format

## 0.244.0

### Minor Changes

- Add remaining forms

## 0.243.0

### Minor Changes

- b5dc556: pnpm changset version
- Add remaining shadcn forms

## 0.242.0

### Minor Changes

- Add more shadcn forms

## 0.241.0

### Minor Changes

- Add new events and update chadcn layout

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.93.0

## 0.240.0

### Minor Changes

- Add microsoft and github login

## 0.239.0

### Minor Changes

- Add chadcn for ui

## 0.238.0

### Minor Changes

- Add storybook

## 0.237.0

### Minor Changes

- 85f639b: Add audience and scope to logs

## 0.236.0

### Minor Changes

- Update the link user logic

## 0.235.0

### Minor Changes

- Improve logging
- Update the logic for account linking

## 0.234.0

### Minor Changes

- Add a act claim to the tokens when impersonating

## 0.233.0

### Minor Changes

- Remove disable signup from legacy client

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.92.0

## 0.232.0

### Minor Changes

- Extend hooks api

## 0.231.0

### Minor Changes

- Update redirect_uri validation logic

## 0.230.0

### Minor Changes

- Add support for subdomain wildcards

## 0.229.0

### Minor Changes

- Add json support for token endpoint

## 0.228.0

### Minor Changes

- Create a new login session for silent auth

## 0.227.0

### Minor Changes

- Update tenant-id header handling

## 0.226.0

### Minor Changes

- Allow change or organization with silent auth

## 0.225.0

### Minor Changes

- Organization support in token endpoint

## 0.224.0

### Minor Changes

- Fix routes for org members
- Change status code for adding member to organization

## 0.223.0

### Minor Changes

- Organization members

## 0.222.0

### Minor Changes

- Fix options for resource servers

## 0.221.0

### Minor Changes

- e917a6a: Fix content-type for reuse of code
- Update ids to match auth0 entity ids

## 0.220.0

### Minor Changes

- Add org name to id-token

## 0.219.0

### Minor Changes

- Return all scopes as default for client credentials

## 0.218.0

### Minor Changes

- # 6858af2: Add client credentials scopes and permissions
- 149ab91: Drop the old application table
  > > > > > > > main
- b0e9595: Add client grants

### Patch Changes

- Updated dependencies [149ab91]
- Updated dependencies [b0e9595]
  - @authhero/adapter-interfaces@0.91.0

## 0.217.0

### Minor Changes

- Added language string

## 0.216.0

### Minor Changes

- Fix issues with lucene filter

## 0.215.0

### Minor Changes

- Add legacy clients to caching

## 0.214.0

### Minor Changes

- Add scopes and permissions

## 0.213.0

### Minor Changes

- Switch from appications to clients entity in managment api

## 0.212.0

### Minor Changes

- Update to use new clients

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.90.0

## 0.211.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.89.0

## 0.211.0

### Minor Changes

- Changed to LegacyClient as a first step in the refactor
- 11c4914: Refactor account pages

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.88.0

## 0.210.0

### Minor Changes

## 0.209.0

### Minor Changes

- d5ebc83: Update endpoints and UI for organziation memebers
- Get organizations crud working like auth0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.87.0

## 0.208.0

### Minor Changes

- Add users to organizations

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.86.0

## 0.207.0

### Minor Changes

- Added organizations

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.85.0

## 0.206.0

### Minor Changes

- Update the UI for change email

## 0.205.0

### Minor Changes

- Add post user login hook

## 0.204.0

### Minor Changes

- Fix x-forwarded-for

## 0.203.0

### Minor Changes

- Handle screen_hint and redirect_uri for accoutn

## 0.202.0

### Minor Changes

- Add impersonation page

## 0.201.0

### Minor Changes

- Reuse existing sessions

## 0.200.0

### Minor Changes

- Add account path
- Add route for account

## 0.199.0

### Minor Changes

- Add a user_id param to the account page

## 0.198.0

### Minor Changes

- Fix the caching

## 0.197.0

### Minor Changes

- Add cache adapter

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.84.0

## 0.196.0

### Minor Changes

- Use separate saml key for encryption

## 0.195.0

### Minor Changes

- Add type to keys

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.83.0

## 0.194.0

### Minor Changes

- Add user roles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.82.0

## 0.193.0

### Minor Changes

- fc8153d: Update structure and endpoints

### Patch Changes

- Updated dependencies [fc8153d]
  - @authhero/adapter-interfaces@0.81.0

## 0.192.0

### Minor Changes

- Add api endpoints for permissions

## 0.191.0

### Minor Changes

- Fetch jwks from database

## 0.190.0

### Minor Changes

- Return multiple saml certificates

## 0.189.0

### Minor Changes

- Add roles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.80.0

## 0.188.0

### Minor Changes

- Update the casing for the migratinos

## 0.187.0

### Minor Changes

- Add resource servers, rules and permissions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.79.0

## 0.186.0

### Minor Changes

- Remove vendorsettings

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.78.0

## 0.185.0

### Minor Changes

- Add a lighten color util

## 0.184.0

### Minor Changes

- Add client_metadata to client type

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.77.0

## 0.183.0

### Minor Changes

- Use theme instead of vendorSetting

## 0.182.0

### Minor Changes

- Add a main tenant adapter

## 0.181.0

### Minor Changes

- Update the themes entity

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.76.0

## 0.180.1

### Patch Changes

## 0.180.0

### Minor Changes

## 0.179.0

### Minor Changes

- Use hono jwt in middleware

## 0.178.0

### Minor Changes

- Fix issue with encoding the redirect-url

## 0.177.0

### Minor Changes

- Handle base path in auth middleware

## 0.176.0

### Minor Changes

- Add themes endpoints

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.75.0

## 0.175.0

### Minor Changes

- Refactor log types

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.74.0

## 0.174.0

### Minor Changes

- Add hook for pre user update

## 0.173.0

### Minor Changes

- Complete first version of change email flow

## 0.172.0

### Minor Changes

- Add a page to change the current users email

## 0.171.0

### Minor Changes

- Use countrycode from vendor settings if available

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.73.0

## 0.170.0

### Minor Changes

- Create refresh tokens for code grant flow

## 0.169.0

### Minor Changes

- Fix creation of password user in combination with linking of users

## 0.168.0

### Minor Changes

- Use corret response type for web message

## 0.167.0

### Minor Changes

- Add the state to the web message

## 0.166.0

### Minor Changes

- Refactor token endpoint

## 0.165.0

### Minor Changes

- c5fb2fa: Refactor grant flows

## 0.164.0

### Minor Changes

- Refactor auth0client

## 0.163.0

### Minor Changes

- Remove fragments from redirect_uri

## 0.162.0

### Minor Changes

- Redirect back to callback url with error

## 0.161.0

### Minor Changes

- Use profile to store preferred login method

## 0.160.0

### Minor Changes

- Add saml support

## 0.159.0

### Minor Changes

- Only enforce ip check on magic link flow
- Updated packages and added danish

## 0.158.0

### Minor Changes

- Redirect straight to single OIDC connection

## 0.157.0

### Minor Changes

- Use normaized user to handle sms login

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.72.0

## 0.156.0

### Minor Changes

- Fetch expired login sessions

## 0.155.0

### Minor Changes

- Store the redirect_uri in codes table on silent auth

## 0.154.0

### Minor Changes

- Add config to connection to enable magic links

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.71.0

## 0.153.0

### Minor Changes

- Added state and nonce to codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.70.0

## 0.152.0

### Minor Changes

- Add redirect_uri to codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.69.0

## 0.151.0

### Minor Changes

- Add code_challenge to codes table

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.68.0

## 0.150.0

### Minor Changes

- Use codes-code_verifier to store pkce challenge

## 0.149.0

### Minor Changes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.67.0

## 0.148.0

### Minor Changes

- Pass the context to the events

## 0.147.0

### Minor Changes

- Expose the onPostLogin type

## 0.146.0

### Minor Changes

- Add a html response for expired code links

## 0.145.0

### Minor Changes

- Complete the login after the form is posted

## 0.144.0

### Minor Changes

- Fix an issue where we passed the session is rather than the login session id

## 0.143.0

### Minor Changes

- Add a login_completed flag to the login sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.66.0

## 0.142.0

### Minor Changes

- Add a form_id property to hooks

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.65.0

## 0.141.0

### Minor Changes

- Update logic for when refresh tokens are created

## 0.140.0

### Minor Changes

- Add form components schemas

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.64.0

## 0.139.0

### Minor Changes

- Update forms schema

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.63.0

## 0.138.0

### Minor Changes

- Update the forms fileds

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.62.0

## 0.137.0

### Minor Changes

- Update the path for the mangement api

## 0.136.0

### Minor Changes

- Add rest endpoints for forms

## 0.135.0

### Minor Changes

- Add forms

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.61.0

## 0.134.0

### Minor Changes

- Enable query string filters for sessions

## 0.133.0

### Minor Changes

- fix issue with getClientInfo returning country code

## 0.132.0

### Minor Changes

- Update the post users

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.60.0

## 0.131.0

### Minor Changes

- Update the copy on the identifier page

## 0.130.0

### Minor Changes

## 0.129.0

### Minor Changes

## 0.128.0

### Minor Changes

- Sms from property

## 0.127.0

### Minor Changes

- Fix issue with country code column missing

## 0.126.0

### Minor Changes

- Facebook app update

## 0.125.0

### Minor Changes

- Format phonenumbers

## 0.124.0

### Minor Changes

- Fix duplicate sessions

## 0.123.0

### Minor Changes

- Add caching to adapters

## 0.122.0

### Minor Changes

- Add caching for adapters

## 0.121.0

### Minor Changes

- Add server timings

## 0.120.0

### Minor Changes

## 0.119.0

### Minor Changes

- Redirect callback to custom domain

## 0.118.0

### Minor Changes

- Use custom domain for auth cookies

## 0.117.0

### Minor Changes

- Separated the connections option schema

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.59.0

## 0.116.0

### Minor Changes

- Add support for sms in universal login

## 0.115.0

### Minor Changes

- Use idle expires at for refresh tokens

## 0.114.0

### Minor Changes

- Change enter-email page to identifier

## 0.113.0

### Minor Changes

- Create sms users

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.58.0

## 0.112.0

### Minor Changes

- Fix broken magic link

## 0.111.0

### Minor Changes

- Add screen_hint for signup

## 0.110.0

### Minor Changes

- Add a otp grant flow for token

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.57.0

## 0.109.0

### Minor Changes

- Add build scripts for tailwind

## 0.108.0

### Minor Changes

- Sms support

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.56.0

## 0.107.0

### Minor Changes

- Update iss in id-token as well

## 0.106.0

### Minor Changes

- Add trailing slash to custom domain iss

## 0.105.0

### Minor Changes

- Change iss to custom domain

## 0.104.0

### Minor Changes

- Add cors for token endpoint

## 0.103.0

### Minor Changes

- Add cors middleware for api endpoints"

## 0.102.0

### Minor Changes

- Allow signup if explicit

## 0.101.0

### Minor Changes

- fetch vendor by subdomain

## 0.100.0

### Minor Changes

- Add a getByDomain function for cutsom domains and a tenant-id middleware

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.55.0

## 0.99.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.54.0

## 0.99.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.53.0

## 0.99.0

### Minor Changes

- fbc3a6c: Make the logout revoke the session and remove refresh tokens
- fbc3a6c: Make logout remove any sessions

## 0.98.0

### Minor Changes

- Update the session id on the login session

### Patch Changes

- Do not allow reuse of login sessions

## 0.97.0

### Minor Changes

- Set the session id on login sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.52.0

## 0.96.0

### Minor Changes

- Fix issues around signup flow

## 0.95.0

### Minor Changes

- Fix pre-signup-sent routes

## 0.94.0

### Minor Changes

- Fix incorrect paths for migrated pages

## 0.93.0

### Minor Changes

- Migrate last pages

## 0.92.0

### Minor Changes

- Migrate pre signup page and email

## 0.91.0

### Minor Changes

- Fix issue with missing login session id

## 0.90.0

### Minor Changes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.51.0

## 0.89.0

### Minor Changes

- Add an optional session refrence to login_sessions and cleanup old tables

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.50.0

## 0.88.0

### Minor Changes

- Use wildcad domains for session cookies

## 0.87.0

### Minor Changes

- Handle code response type in silent auth flow

## 0.86.0

### Minor Changes

- Hande idle_expires_at in silent auth

## 0.85.0

### Minor Changes

- Create a new password if it doesn't exist

## 0.84.0

### Minor Changes

### Patch Changes

- Updated dependencies [a9959ad]
  - @authhero/adapter-interfaces@0.49.0

## 0.83.0

### Minor Changes

- Add the request object to the hooks event

## 0.82.0

### Minor Changes

- 52896d7: Add pre user registration hook
- 52896d7: Add the post user registration hook

## 0.81.0

### Minor Changes

- Add a cloudflare adapter

## 0.80.0

### Minor Changes

- Use correct email template

## 0.79.0

### Minor Changes

- Only validate IP for magic links

## 0.78.0

### Minor Changes

- Get passwords can return nul

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.48.0

## 0.77.0

### Minor Changes

- Ensure hooks are invoked

## 0.76.0

### Minor Changes

- Fix issue with redirect url encoding

## 0.75.0

### Minor Changes

- Add custom domain routes

## 0.74.2

### Patch Changes

- Create the user if there's a matching email

## 0.74.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.47.0

## 0.74.0

### Minor Changes

## 0.73.0

### Minor Changes

- Add post user login webhook back

## 0.72.0

### Minor Changes

- Pass login session in check account

## 0.71.0

### Minor Changes

- Fix path for post check-account

## 0.70.0

### Minor Changes

- Create new users with passwordless

## 0.69.0

### Minor Changes

- Add connection to magic link

## 0.68.0

### Minor Changes

- Fix magic links

## 0.67.0

### Minor Changes

- Migrate reset password

## 0.66.0

### Minor Changes

- Migrate signup route

## 0.65.0

### Minor Changes

- Migarate reset password

## 0.64.0

### Minor Changes

- Migrate enter password

## 0.63.0

### Minor Changes

- Migrate code flow

## 0.62.0

### Minor Changes

- Add the enter email form

## 0.61.0

### Minor Changes

- Handle expires at for sessions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.46.0

## 0.60.0

### Minor Changes

- Enforce idle expire at

## 0.59.0

### Minor Changes

- Create temporary tables

## 0.58.0

### Minor Changes

- Add refresh_tokens route

## 0.57.0

### Minor Changes

- Update entities for sessions and refresh tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.45.0

## 0.56.0

### Minor Changes

- Recreate the tables for sessions and refresh tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.44.0

## 0.55.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.43.0

## 0.55.0

### Minor Changes

- Update session entity

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.42.0

## 0.54.0

### Minor Changes

- Update open-configuration

## 0.53.0

### Minor Changes

- Add refresh token grant support

## 0.52.0

### Minor Changes

- 23c2899: Use default audience from tenant for refresh token

### Patch Changes

- Updated dependencies [23c2899]
  - @authhero/adapter-interfaces@0.41.0

## 0.51.0

### Minor Changes

- Add refresh tokens to jwt

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.40.0

## 0.50.0

### Minor Changes

- Store refresh tokesn

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.39.0

## 0.49.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.38.0

## 0.49.0

### Minor Changes

- Update logs for logins

## 0.48.0

### Minor Changes

- Allow wildcards on the path

## 0.47.0

### Minor Changes

- create variables to separate issuer from domains

## 0.46.0

### Minor Changes

- fix padding for pkce

## 0.45.0

### Minor Changes

- Fetch facebook userinfo from me endpoint

## 0.44.0

### Minor Changes

- pass the access token for the vipps connection

## 0.43.0

### Minor Changes

- Fix for universal auth emails

## 0.42.0

### Minor Changes

- Use default client for magic link

## 0.41.0

### Minor Changes

- Add saml support

## 0.40.0

### Minor Changes

- Optimized bundles

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.37.0

## 0.39.0

### Minor Changes

- 16dc682: fix vipps integration

## 0.38.0

### Minor Changes

- fix issue with user_id in code grant flow

## 0.37.0

### Minor Changes

- migrate the enter-email page

## 0.36.2

### Patch Changes

- Remove list params where not needed

## 0.36.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.36.0

## 0.36.0

### Minor Changes

- fix json format for connection options

## 0.35.0

### Minor Changes

- migrate callback route

## 0.34.0

### Minor Changes

- migrate the callback routes

## 0.33.0

### Minor Changes

- Use default clients for connections

## 0.32.1

### Patch Changes

- check default client for callback

## 0.32.0

### Minor Changes

- migrate connection auth
- a0a18c9: move most of authorize endpoint

### Patch Changes

- Updated dependencies
- Updated dependencies [a0a18c9]
  - @authhero/adapter-interfaces@0.35.0

## 0.31.0

### Minor Changes

- add password routes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.34.0

## 0.30.0

### Minor Changes

- 3347f29: add passwordless routes

## 0.29.0

### Minor Changes

- add language files

## 0.28.0

### Minor Changes

- pass email provider to email service

## 0.27.0

### Minor Changes

- update packages

## 0.26.0

### Minor Changes

- add id-token support to hook
- migrate dbconnections and setup email providers

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

- update the build

## 0.25.0

### Minor Changes

- update hook signature

## 0.24.0

### Minor Changes

- add hooks to add claims to token

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.32.0

## 0.23.0

### Minor Changes

- set used_at for codes

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.31.0

## 0.22.0

### Minor Changes

- fix incorrect imports

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.30.0

## 0.21.0

### Minor Changes

- fix redirect validation logic
- c16a591: add userinfo and logout endpoints

## 0.20.2

### Patch Changes

- Updated dependencies [fbc0e55]
  - @authhero/adapter-interfaces@0.29.1

## 0.20.1

### Patch Changes

- fix refernce to safe compare

## 0.20.0

### Minor Changes

- add a default client as a temporary solutoin

## 0.19.0

### Minor Changes

- add a fallback client as a temporary solution

## 0.18.0

### Minor Changes

- moved the init of the hooks

## 0.17.0

### Minor Changes

- add silent tokens

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.29.0

## 0.16.0

### Minor Changes

- switch back to native enum

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.28.0

## 0.15.0

### Minor Changes

- 05c7273: Add authorization code grant support
- 14794b6: support id-tokens
- moved token types from the interfaces to the authhero package
- 76b4c53: add client credentials support

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.27.0

## 0.14.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.26.0

## 0.14.0

### Minor Changes

- added email providers and removed tickets
- Added email providers

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.25.0

## 0.13.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.24.0

## 0.13.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.23.0

## 0.13.0

### Minor Changes

- remove path prefix for management routes

## 0.12.0

### Minor Changes

- do not pass interfaces as peer dependency

## 0.11.0

### Minor Changes

- pass the interfaces as a peer dependency

## 0.10.1

### Patch Changes

- remove the iife build files
- Updated dependencies
  - @authhero/adapter-interfaces@0.22.1

## 0.10.0

### Minor Changes

- Get the demo project rendering

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.22.0

## 0.9.0

### Minor Changes

- Added a act-as property to the auth params

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.21.0

## 0.8.0

### Minor Changes

- Add the keys endpoints

## 0.7.0

### Minor Changes

- Add auth middleware for management routes

## 0.6.0

### Minor Changes

- Add support for include_totals in hooks

## 0.5.0

### Minor Changes

- Store hook booleans as integers
- bb18986: Add prompts endpoint

## 0.4.0

### Minor Changes

- 0bbc1a4: Migrate logs and user routes
- 26e2ef9: Fixed the connection tests and handle include_totals correctly
- Add the users by email endpoint

### Patch Changes

- 35338fc: Add tests for users

## 0.3.0

### Minor Changes

- 4064c4d: Add clients endpoints
- a4b587d: Added the connection routes

### Patch Changes

- 8244aa2: Pass the issuer in the config rather than in env
- 8244aa2: Add test server with migrations
- 8244aa2: Added tests for tenants endpoint

## 0.2.38

### Patch Changes

- Expose the migration script for kysely and add authhero test
- Updated dependencies
  - @authhero/adapter-interfaces@0.20.3

## 0.2.37

### Patch Changes

- Update packages
- Updated dependencies
  - @authhero/adapter-interfaces@0.20.2

## 0.2.36

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.20.1

## 0.2.35

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.20.0

## 0.2.34

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.19.0

## 0.2.33

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.18.0

## 0.2.32

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.17.1

## 0.2.31

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.17.0

## 0.2.30

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.16.0

## 0.2.29

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.6

## 0.2.28

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.5

## 0.2.27

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.4

## 0.2.26

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.3

## 0.2.25

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.2

## 0.2.24

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.15.1

## 0.2.23

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.15.0

## 0.2.22

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.14.0

## 0.2.21

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.13.0

## 0.2.20

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.12.0

## 0.2.19

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.9

## 0.2.18

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.8

## 0.2.17

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.7

## 0.2.16

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.6

## 0.2.15

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.5

## 0.2.14

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.4

## 0.2.13

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.3

## 0.2.12

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.2

## 0.2.11

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.11.1

## 0.2.10

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @authhero/adapter-interfaces@0.11.0

## 0.2.9

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.5

## 0.2.8

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.4

## 0.2.7

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.3

## 0.2.6

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.2

## 0.2.5

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.10.1

## 0.2.4

### Patch Changes

- Updated the types for logins and fixed the packaging for authhero
- Updated dependencies
  - @authhero/adapter-interfaces@0.10.0

## 0.2.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.9.2

## 0.2.2

### Patch Changes

- Centralized all codes to the codes table and added a new logins table for the login sessions. The old tables will be removed in the next update
- Updated dependencies
  - @authhero/adapter-interfaces@0.9.1

## 0.2.1

### Patch Changes

- Updated the package to reference to correct folder

## 0.2.0

### Minor Changes

- Update the package to support both esm and cjs

## 0.1.0

### Minor Changes

- a1212dc: Added a jwks route with mock data
