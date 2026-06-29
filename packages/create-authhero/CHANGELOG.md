# create-authhero

## 0.47.1

### Patch Changes

- 74f69fe: Bump stale third-party version pins in generated project templates: `@hono/zod-openapi` `^0.19.0` → `^1.4.0` (aligns with `authhero` core, which requires v1 — previously a major-version mismatch), `@hono/swagger-ui` `^0.5.0` → `^0.6.0`, `hono` `^4.6.0` → `^4.12.0`, `wrangler` `^3.0.0` → `^4.0.0`, `typescript` `^5.5.0` → `^5.9.0`, and `@types/node` `^20.0.0` → `^22.0.0`.

## 0.47.0

### Minor Changes

- 57a5442: Add two Workers-for-Platforms templates that complete the WFP control-plane-defaults setup:

  - **`cloudflare-wfp-tenant`** — a per-tenant authhero Worker (its own D1) that inherits the control plane's defaults via `withRuntimeFallback`, with keyed encryption (`createEncryptedDataAdapterWithKeyRing`) so the shared `cp`-keyed secrets are held but not readable from a raw database export. Deploys into the `authhero-tenants` dispatch namespace.
  - **`cloudflare-control-plane`** — the management surface and rollout source. Runs `initMultiTenant` and exposes `POST /internal/tenants/:id/sync-defaults`, which uses `createDirectRolloutAdapter` to project the control plane's defaults into a tenant's database. Ships with a `buildTenantAdapters` stub to fill in per-tenant D1 resolution.

  Together with the existing `cloudflare-wfp-dispatcher` (front door), these scaffold the full three-Worker WFP topology. Both new templates generate a `.dev.vars` with `ENCRYPTION_KEY` and the shared `CONTROL_PLANE_ENCRYPTION_KEY`.

## 0.46.0

### Minor Changes

- 0ed5f14: Switch the Cloudflare Workers template to `@authhero/drizzle` (with `drizzle-orm/d1`) as the runtime adapter. Drops the `kysely-d1`, `kysely`, and `@authhero/kysely-adapter` runtime dependencies in favor of drizzle's native D1 driver, which avoids the community shim and aligns the runtime adapter with the migration source-of-truth (drizzle migrations were already used). Local and AWS-SST templates are unchanged and continue to use Kysely.

  Also bumps the template's `compatibility_date` to `2026-05-01`.

- 930f365: Add a `cloudflare-wfp-dispatcher` template that scaffolds a thin Cloudflare Worker for routing per-publisher custom domains to per-tenant authhero workers deployed in a Cloudflare Workers for Platforms dispatch namespace.

  The dispatcher uses `@authhero/proxy`'s new `dispatch_namespace` handler to resolve incoming `Host` headers against the shared platform D1 (`custom_domains` table) and forward to `tenant-<id>-auth` scripts in the `authhero-tenants` namespace. Tenant workers are deployed separately via the existing `cloudflare` template using `wrangler deploy --dispatch-namespace=authhero-tenants --name=tenant-<id>-auth`.

  Scaffold via `create-authhero --template=cloudflare-wfp-dispatcher`. See the generated `README.md` for the full onboarding workflow.

## 0.45.0

### Minor Changes

- ed6e2bc: Add optional at-rest encryption for sensitive credential fields. Set the `ENCRYPTION_KEY` binding (base64-encoded 32 bytes) and wrap the data adapter with the new `createEncryptedDataAdapter` to transparently AES-256-GCM-encrypt `clients.client_secret`, upstream secrets in `connections.options`, `email_providers.credentials`, `authentication_methods.totp_secret`, and `migration_sources.credentials`. Existing plaintext rows keep working via an `enc:v1:` version prefix and migrate lazily on write. When `ENCRYPTION_KEY` is unset, behavior is unchanged.

  `create-authhero` now enables this by default: scaffolded projects (local, cloudflare, aws-sst) generate a random `ENCRYPTION_KEY` into their dev env file (`.env` / `.dev.vars`) and wire `createEncryptedDataAdapter` into both the server entry and the seed script. Production deployments should set their own key (`wrangler secret put ENCRYPTION_KEY` for Cloudflare, a stage env/secret for AWS).

## 0.44.0

### Minor Changes

- 1b7a39b: The local template's `migrate` step now creates the `proxy_routes` table as part of the standard `@authhero/kysely-adapter` migrations, and the generated server exposes `/api/v2/proxy-routes` for managing proxy routes per tenant. The proxy template README gains documented database-backed (via `@authhero/kysely-adapter`) and HTTP-backed adapter configurations alongside the static default.
- 1b7a39b: Proxy v2: replace the legacy `path_pattern` + `upstream_type` + fixed two-phase middleware model with a JSON-configured route schema (`match` + ordered `handlers`) and a Hono-native execution model. Routes now match on path **plus** method, host pattern (`*.example.com`), request headers, and query params. Handlers are composable `(c, next) => Response` middleware compiled into a per-host Hono sub-app — they can short-circuit, reorder (e.g. `cache` before `basic_auth`), and post-process responses. Built-in handlers cover the legacy custom-domains proxy: `http`, `service_binding` (Cloudflare bindings via the new `bindings` option on `createProxyApp`), `redirect`, `static`, `cors`, `basic_auth`, `headers`, `cache`, `forwarded_headers` (X-Real-IP / X-Original-URL / X-Forwarded-\*), `rewrite_cookies` (upstream `Domain=`), and `rewrite_location` (3xx Location origin). New `createHttpProxyAdapter` reads route config from a remote AuthHero control plane over `client_credentials`, with an optional `createCacheApiHostCache` layer that uses `caches.default` for per-colo warmth (no KV needed). AuthHero exposes the privileged `GET /api/v2/proxy/control-plane/hosts/:host` endpoint via the new `proxyControlPlane` config option. Kysely and Drizzle adapters ship forward migrations that backfill existing rows; the legacy `path_pattern`/`upstream_type`/`upstream_url`/`preserve_host`/`middleware` columns are replaced with JSON `match` and `handlers`.

## 0.43.0

### Minor Changes

- ac2d7b9: Add `--template proxy` to scaffold a Cloudflare Workers reverse proxy built on `@authhero/proxy`. The generated project ships a `src/proxy.config.ts` (edited statically by the user), a Worker entry that wires `createStaticProxyAdapter` + `createProxyApp` with a 5-minute fresh / 1-hour stale SWR cache, and AsyncLocalStorage glue so background refreshes use `ctx.waitUntil`. No database, no migrations.

## 0.42.0

### Minor Changes

- 5e35511: Update for the new UI

### Patch Changes

- b8213fb: Make `@authhero/admin` publishable and swap it in for `@authhero/react-admin` in the Docker image and `create-authhero` templates (local + cloudflare). The shadcn-based admin is now the default UI mounted at `/admin`. `@authhero/react-admin` remains in the workspace for now but is no longer wired into Docker or generated projects.

## 0.41.2

### Patch Changes

- 0c662c0: Enable `enable_dynamic_client_registration` on the conformance tenant when `--conformance` is set. The flag is required by the new `oidcc-dynamic-certification-test-plan` runner — without it, the conformance suite's `POST /oidc/register` calls fail because the tenant doesn't advertise a `registration_endpoint`. Existing tenant flags (e.g. `inherit_global_permissions_in_organizations` set by seed for the control-plane tenant) are preserved by reading the tenant first and merging.

## 0.41.1

### Patch Changes

- 85d1d06: Fix the scaffolder-generated `seed.ts` to pass `auth0_conformant` through from each client entry in the `--clients` JSON arg. The previous code copied a fixed set of fields (`client_id`, `client_secret`, `name`, `callbacks`, etc.) and silently dropped `auth0_conformant`, so clients defined as `{ ..., "auth0_conformant": false }` were created with Auth0-compatible defaults instead. This caused the OIDC conformance refresh-token test to fail with HTTP 403 (legacy Auth0 behavior) where the spec mandates HTTP 400 — the gate in `refresh-token.ts` reads `client.auth0_conformant`, but the value was never persisted.
- 85d1d06: Restore HTTPS support to the `local` template's `src/index.ts`. The `ensureCertificates()` block (mkcert/openssl self-signed cert generation) and the `createServer: https.createServer` wiring were inadvertently removed in an earlier change, leaving generated auth-servers HTTP-only. The conformance-runner pipeline depends on HTTPS so its discovery checks (e.g. `CheckDiscEndpointAllEndpointsAreHttps`) can pass.

## 0.41.0

### Minor Changes

- ea5ec43: Add endpoints for organization connections

## 0.40.0

### Minor Changes

- 4b7c1f6: Generated local seed.ts now accepts `--clients` and `--user-profile` JSON flags for setting up additional clients and a populated user profile (used by the OIDC conformance suite). When generated with `--conformance`, the seed also sets the tenant `default_audience` so the OIDCC `/token` endpoint can issue access tokens without a per-request audience.

## 0.39.0

### Minor Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

## 0.38.0

### Minor Changes

- 884e950: Remove https

## 0.37.0

### Minor Changes

- 2f65572: Fix nested transactions

## 0.36.0

### Minor Changes

- 164fe2c: Added passkeys

## 0.35.0

### Minor Changes

- 76812fe: Set GET as default for screen method
- 7c52f88: Fix setup guide bugs

## 0.34.0

### Minor Changes

- b3ad21f: Update setup with new ui

## 0.33.0

### Minor Changes

- 8286a6a: Add a setup UI

## 0.32.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

## 0.31.0

### Minor Changes

- 818846d: Change to use auth0 instead of auth2

## 0.30.0

### Minor Changes

- 897ca72: Use username as default for create-authhero

## 0.29.0

### Minor Changes

- 65321b7: Update for forms, flows and u2 login

## 0.28.0

### Minor Changes

- c5935bd: Update the new widget endpoints

## 0.27.0

### Minor Changes

- ac8af37: Add custom text support

## 0.26.0

### Minor Changes

- 8b9cb85: First passing openid test

## 0.25.0

### Minor Changes

- 9d6cfb8: Wrap adapters as part of the multi-tenant package

## 0.24.0

### Minor Changes

- 881d33b: Add aws deployment target

## 0.23.0

### Minor Changes

- d7e8c95: Update dependencies

## 0.22.0

### Minor Changes

- 8611a98: Improve the multi-tenancy setup

## 0.21.0

### Minor Changes

- 47fe928: Refactor create authhero
- f4b74e7: Add widget to react-admin
- b6d3411: Add a hono demo for the widget

## 0.20.0

### Minor Changes

- 6dcb42e: Refactor assets

## 0.19.0

### Minor Changes

- 71b01a6: Move authhero to peer dependency

## 0.18.0

### Minor Changes

- 63e4ecb: Use assets folder
- 8858622: Move fallbacks to multi-tenancy package

## 0.17.0

### Minor Changes

- bf9d776: Add semantic release to create authhero

## 0.16.0

### Minor Changes

- 928d358: Add userinfo hook

## 0.15.0

### Minor Changes

- aaf0aa0: Fix paging issue for scopes
- aaf0aa0: Update permissions casing

## 0.14.0

### Minor Changes

- 3dcc620: Use migrations from drizzle

## 0.13.0

### Minor Changes

- b778aed: Seed mananagement roles and create organizations

## 0.12.0

### Minor Changes

- 283daf2: Refactor multi-tenancy package
- ae8553a: Add is_system to all adapters

## 0.11.0

### Minor Changes

- e87ab70: Move tenants crud to multi-tenancy package

## 0.10.0

### Minor Changes

- 100b1bd: Patch the redirect action for flows

## 0.9.0

### Minor Changes

- 9e34783: Sync resource servers for multi tenancy setup

## 0.8.0

### Minor Changes

- 02567cd: Make create authhero work with d1 locally

## 0.7.0

### Minor Changes

- 56541fe: Fix create authhero

## 0.6.0

### Minor Changes

- 49d5eb8: Fix npm package for create-authhero

## 0.5.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

## 0.4.0

### Minor Changes

- 6929f98: Improve the create authhero for local

## 0.3.0

### Minor Changes

- 85b58c4: Update the scripts and the logic in the identifier page

## 0.2.0

### Minor Changes

- Updated packages and added danish

## 0.1.2

### Patch Changes

- Expose the migration script for kysely and add authhero test

## 0.1.1

### Patch Changes

- Updated the version of authhero

## 0.1.0

### Minor Changes

- Added template files to created project
