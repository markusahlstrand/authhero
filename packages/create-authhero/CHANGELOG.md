# create-authhero

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
