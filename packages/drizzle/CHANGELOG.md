# @authhero/drizzle

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
