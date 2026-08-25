# @authhero/drizzle

## 1.6.0

### Minor Changes

- fb874ea: Revoking or deleting a session now revokes the refresh tokens issued under it.

  `DELETE /api/v2/sessions/{id}` and `POST /api/v2/sessions/{id}/revoke` used to
  touch only the sessions row, and the refresh grant checks nothing but the
  token's own `revoked_at` — so a revoked session's refresh tokens kept minting
  access tokens until they expired on their own. Auth0 documents the opposite for
  the same endpoint: _"Revokes a session by ID and all associated refresh
  tokens."_

  The same hole was live on the user-block path. `revokeUserSessions` resolved
  tokens through `sessions.login_session_id`, which is written once at session
  creation and never repointed on SSO reuse, so it records only the session's
  _originating_ authorization transaction. Every token minted during a later
  re-authorization — a normal multi-client case — survived a block. Both paths now
  share one cascade keyed on `refresh_tokens.session_id`, with the login-session
  sweep retained alongside it for rows minted before that column existed. The
  block path also runs the cascade for sessions that are already revoked, so
  sessions revoked before this release do not keep live tokens.

  Adapters gain `refreshTokens.revokeBySession(tenant_id, session_id,
revoked_at)`, implemented for kysely, drizzle and DynamoDB. Custom adapters must
  add it.

  **Revocation couples; lifetime does not.** A session _expiring_ still does not
  touch its refresh tokens, and cleanup still deletes each table on its own clock
  — a refresh token is designed to outlive its session, and cascading on SSO
  timeout would log out every long-lived native client. Only deliberate revocation
  cascades.

  This is a visible behavioural change: admins who revoke a session to end a
  browser login will now also end that session's refresh tokens, which is the
  intent.

### Patch Changes

- Updated dependencies [fb874ea]
  - @authhero/adapter-interfaces@4.10.0
  - @authhero/proxy@0.10.9

## 1.5.0

### Minor Changes

- 95f091a: Select refresh tokens by user with an exact predicate, not the Lucene grammar

  Both SQL adapters split a `q` filter on `OR` _before_ tokenizing it, so a
  user id containing `OR user_id:<other> OR` produced a clean middle clause
  that matched another user's rows. Quoting the value did not prevent this — the
  quotes only bracket the first and last fragments, leaving anything between
  them parsed as query syntax. On the bulk-revoke path that meant another user's
  tokens could be revoked.

  `RefreshTokenListParams` now carries `user_id` as a first-class exact
  predicate, and `RefreshTokensAdapter` gains
  `revokeByUser(tenant_id, user_id, revoked_at)`. Both compile to equality
  comparisons, so a user id is never parsed as a query. `revokeByUser` also skips
  rows that already carry a `revoked_at`, so a concurrent bulk revocation cannot
  overwrite the first one's audit timestamp — and it replaces an N+1 list-then-
  update loop with a single statement.

  Regression coverage runs against both the kysely and drizzle implementations.

- a748f96: Store the session and auth-event facts on refresh tokens (#1257, stage 2 of #1255)

  Adds five nullable columns to `refresh_tokens`, populated at mint and carried
  across rotation:
  - `session_id` — the authenticated session the token was issued under, Auth0's
    field of the same name. Deliberately **not** a foreign key and never part of
    a cascade delete: a refresh token is expected to outlive its session, so
    cleanup removes the session row first and this pointer is left to dangle. It
    carries revocation semantics only, which the next stage builds on.
  - `organization`, `auth_connection`, `auth_strategy` — auth-event facts
    denormalised from the login session. All are immutable for the life of the
    token, and the refresh grant currently resolves them at exchange time from a
    short-lived `login_sessions` row that is routinely cleaned up, silently
    yielding `undefined` when it is gone.

  The refresh grant reads these columns, preferring them over the login session
  and skipping that read entirely when `session_id` is present. Rows minted
  before this land keep every column null — the same state Auth0 represents with
  a null `session_id` — and fall back to the previous login-session lookup, so
  their behaviour is unchanged.

  **Migrations must run before the new code is deployed:** the code writes columns
  that have to exist. Older code against the new schema is fine, so a rolling
  deploy is safe in that direction only.

  A backfill ships alongside, populating the columns for existing tokens from
  their parent `login_sessions` row where it still exists; tokens whose parent
  has been cleaned up stay null. All four facts are written together or not at
  all — `session_id` is the marker the refresh grant reads to decide whether it
  still needs the login session, so setting it alone would make the grant skip a
  lookup it still needs.

  Also de-duplicates the kysely `refresh_tokens` row mapper, which was copied
  across `get`, `getByLookup` and `list`, into a single `toRefreshToken`.

### Patch Changes

- 0472ec4: Make user search by full email address an indexed lookup

  A bare `q` token on `GET /api/v2/users` was always turned into
  `LIKE '%token%'` across email, name and phone_number. A leading wildcard is
  unindexable, so searching for a user by email scanned every row in the tenant —
  twice when `include_totals=true`. A token that is a complete email address now
  resolves to an equality comparison against the email column alone, which the
  `(email, provider, tenant_id)` unique index serves as a seek. Partial terms
  ("@example.com", "harald") keep the substring behaviour.

  The totals count also runs alongside the page query instead of after it.

- c039bb9: Fix account linking with Auth0's `{ provider, user_id }` body, and the bare-id
  shape of `identities[].user_id`

  `POST /api/v2/users/{id}/identities` accepts either `link_with` or
  `{ provider, user_id }`. In the second form Auth0 takes the secondary's id
  **without** its provider prefix — "for the identifier
  `google-oauth2|108091299999329986433`, `provider` is `google-oauth2` and
  `user_id` is `108091299999329986433`" — but the handler looked up `body.user_id`
  verbatim, found no user and returned a 400, _"Linking an inexistent identity is
  not allowed."_ This is the shape the Auth0 SDK (and therefore the admin UI's
  "Link user" button) sends, so linking was broken there for every account. The
  full `provider|id` is now rebuilt before the lookup; an id that already carries
  its `provider|` prefix still resolves.

  `parseUserId` and `userIdParse` split on the _first_ pipe rather than every
  pipe. Enterprise identifiers embed pipes of their own — `samlp|okta|jane` is
  provider `samlp` plus bare id `okta|jane` — so `identities[]` reported
  `okta`, an id belonging to no user and impossible to unlink. Management-api user
  creation with a provider-prefixed `user_id` was truncating the same way, storing
  a different id than the caller asked for; it now strips only a leading
  `provider|`.

  The drizzle adapter reported the _full_ `provider|id` in `identities[].user_id`,
  where Auth0 and the kysely adapter report the bare id. Besides the response
  divergence, `unlink` takes the bare id and re-prefixes it, so the value drizzle
  handed out round-tripped to `provider|provider|id` and unlinked nothing while
  still returning 200 — the admin UI's "Unlink" button silently did nothing on
  drizzle. It now reports the bare id.

- a748f96: Add user refresh-token management, matching Auth0's contract.

  `GET /api/v2/users/{user_id}/refresh-tokens` lists a user's refresh tokens and
  `DELETE /api/v2/users/{user_id}/refresh-tokens` revokes all of them (204). The
  list supports Auth0's checkpoint pagination (`from`/`take` returning
  `{ tokens, next }`) as well as this codebase's offset style
  (`include_totals`/`page`/`per_page`), so both Auth0 SDK clients and the admin UI
  work against it. Responses carry only Auth0-equivalent fields: token secrets
  (`token_lookup`, `token_hash`) and internal rotation bookkeeping (`family_id`,
  `rotated_to`, `rotated_at`) are omitted.

  Unlike Auth0, the bulk delete soft-revokes (sets `revoked_at`) rather than
  removing rows, so the admin UI and the audit trail still show what was
  invalidated and when.

  The single-token routes are now also mounted at `/api/v2/refresh-tokens/{id}`,
  matching Auth0's hyphenated spelling; the existing `/api/v2/refresh_tokens/{id}`
  path stays as an alias.

  Adapters gain checkpoint pagination on `refreshTokens.list`, and the drizzle
  implementation's `include_totals` count no longer ignores the query filter (it
  reported the tenant-wide row count).

  The admin UI gains a "Refresh Tokens" tab on the user page with per-token revoke
  and a "Revoke all refresh tokens" button.

- Updated dependencies [0472ec4]
- Updated dependencies [c039bb9]
- Updated dependencies [95f091a]
- Updated dependencies [a748f96]
  - @authhero/adapter-interfaces@4.9.0
  - @authhero/proxy@0.10.8

## 1.4.2

### Patch Changes

- Updated dependencies [285af35]
  - @authhero/adapter-interfaces@4.8.1
  - @authhero/proxy@0.10.7

## 1.4.1

### Patch Changes

- Updated dependencies [8dff2d9]
  - @authhero/proxy@0.10.6

## 1.4.0

### Minor Changes

- 6d82d84: Add weekly refresh-token cohort retention analytics with optional client filtering

  New `GET /api/v2/analytics/refresh-token-retention` management endpoint (weeks 1-26, repeatable `client_id` filter), backed by an optional `refreshTokenRetention` method on the analytics adapter. Rotating refresh tokens are folded into rotation families before the cohort fold, so each unit represents a device/app that got a refresh token rather than each rotation. Implemented for the drizzle and kysely adapters.

### Patch Changes

- Updated dependencies [6d82d84]
  - @authhero/adapter-interfaces@4.8.0
  - @authhero/proxy@0.10.5

## 1.3.1

### Patch Changes

- 9c9fefe: Make role permission assignment and removal idempotent so the management API stops returning 500 for no-op changes.
  - `POST /api/v2/roles/{id}/permissions` returned 500 when re-assigning a permission the role already had. PlanetScale reports duplicate keys in the error message rather than as `ER_DUP_ENTRY` on `error.code`, so the kysely adapter rethrew the duplicate and the route surfaced it as "Failed to assign permissions to role".
  - `DELETE /api/v2/roles/{id}/permissions` returned 500 when removing a permission the role did not have: both the kysely and drizzle adapters resolved `false` when no rows matched, and the route treats `false` as an adapter failure. They now resolve `true`, matching the AWS adapter, and the interface documents the contract.
  - The drizzle adapter no longer deletes every permission on a role when `remove` is called with an empty array (`or()` over no predicates collapsed the where clause to tenant + role).

- Updated dependencies [060b2d5]
- Updated dependencies [9c9fefe]
- Updated dependencies [bed0939]
  - @authhero/adapter-interfaces@4.7.0
  - @authhero/proxy@0.10.4

## 1.3.0

### Minor Changes

- 3c960f4: Make page hooks a persistable hook type. The `post-user-login` dispatch for page hooks already existed, but there was no way to store one: the hook schema union had no page variant and neither adapter had the columns, so a page hook could only be injected by monkeypatching `hooks.list` (as the impersonation tests did).
  - `hookInsertSchema` / `hookSchema` gain a page variant with `page_id` (an enum — currently `impersonate` — so a misconfigured hook can't bounce logins to an arbitrary universal-login path) and the optional `permission_required` gate. Page hooks are restricted to the `post-user-login` trigger, the only point they can run.
  - The kysely and drizzle hooks tables gain nullable `page_id` / `permission_required` columns, with additive migrations.
  - The admin UI gains a "Page" hook type in the create form and details tab, listing the available pages and the permission gate, and shows `Page` in the hooks list.

  This lets the impersonation page be configured as an ordinary hook — including as an `inheritable` hook on a control-plane tenant, which surfaces it on every sub-tenant — instead of being hard-coded into a deployment's `onExecutePostLogin` config hook. That matters beyond configurability: a config hook that redirects returns before the tenant's database hooks are ever read, so a hard-coded impersonation redirect silently prevented form hooks from ever running for users holding the permission.

- 73e8fff: Add session cohort retention analytics. New `GET /api/v2/analytics/session-retention` management endpoint returns weekly session cohorts (sessions created per week × share still active N weeks later), computed from the sessions table's `created_at_ts`/`used_at_ts`. Implemented as an optional `sessionRetention` method on the analytics adapter (kysely + drizzle; adapters without it get a 501). The admin analytics page gains Overview/Retention tabs with a cohort retention heatmap.

### Patch Changes

- Updated dependencies [3c960f4]
- Updated dependencies [73e8fff]
  - @authhero/adapter-interfaces@4.6.0
  - @authhero/proxy@0.10.3

## 1.2.0

### Minor Changes

- 8b3e137: Add retention cleanup for action_executions

  The `action_executions` table grew without bound: a row is written for every
  action execution and nothing ever pruned them.
  - `ActionExecutionsAdapter` gains an optional `cleanup(olderThan)` method.
    Optional because some backends (DynamoDB TTL, Analytics Engine) expire rows
    themselves.
  - The kysely and drizzle adapters implement it as an indexed, chunked delete
    on `created_at_ts`, with a migration adding the index each was missing.
  - `runRetention` now sweeps `action_executions` (default: 30 days of history),
    skipping adapters without `cleanup`. A standalone `cleanupActionExecutions`
    helper is exported for deployments that sweep tables on separate schedules.

### Patch Changes

- Updated dependencies [8b3e137]
- Updated dependencies [c0d148a]
  - @authhero/adapter-interfaces@4.5.0
  - @authhero/proxy@0.10.2

## 1.1.0

### Minor Changes

- 5b31dcc: Add an opt-in "Last used" connection hint to the u2 universal-login identifier and login screens (#1138).
  - New `show_last_used_connection` flag on `promptSettings` (default `false`). When enabled, a successful login writes a per-tenant `httpOnly` cookie holding only the connection name (~1 year, never on failed auth), and the identifier/login screens badge the matching social connection button.
  - `provider_details` in the Forms schema gains `last_used` and a server-translated `last_used_label`.
  - The widget renders the badge via a new `button-social-badge` (and `button-social-badge-<provider>`) shadow part, leaving the documented `button-social-subtitle` `::part()` behaviour untouched.

- b7f67aa: Add SCIM 2.0 inbound-provisioning configuration plumbing (Phase 1 of #1191). Introduces three optional, tenant-scoped entities — `scimConfigurations` (one config per connection), `scimTokens` (hashed long-lived bearer tokens), and `scimExternalIds` (IdP `externalId` → `user_id` lookup) — with drizzle and kysely adapter implementations and migrations. Exposes the Auth0-parity management API under `/api/v2/connections/{id}/scim-configuration` (config CRUD, `default-mapping`, and token mint/list/delete), guarded by the existing `*:scim_config` / `*:scim_token` scopes and mounted only when the SCIM adapters are wired. Raw token secrets are returned once and stored only as SHA-256 hashes. The `/scim/v2` provisioning endpoints themselves land in Phase 2.
- 8af3eab: Add an Auth0-parity `blocked` flag to users. A blocked user cannot authenticate or refresh tokens: the password login path rejects with `USER_BLOCKED`, the refresh_token grant returns `invalid_grant`, and `createAuthTokens` fails closed for every other grant. Blocking a user via the management API (`PATCH /api/v2/users/{id}` with `blocked: true`) also revokes the user's sessions and refresh tokens, mirroring Auth0's session termination on block. The field is stored on both the drizzle and kysely adapters (nullable column, additive migrations). This is the prerequisite for SCIM `active: false` deprovisioning (#1191).

### Patch Changes

- Updated dependencies [5b31dcc]
- Updated dependencies [b7f67aa]
- Updated dependencies [52811ff]
- Updated dependencies [8af3eab]
  - @authhero/adapter-interfaces@4.4.0
  - @authhero/proxy@0.10.1

## 1.0.0

### Major Changes

- 47851c3: **License change: AuthHero is now dual-licensed (AGPL-3.0-only or commercial).**

  The core server and its runtime packages (`authhero`, the database adapters, `saml`,
  `multi-tenancy`, `proxy`, `@authhero/admin`) are now licensed **AGPL-3.0-only**, with
  commercial licenses available. The integration surfaces stay permissive:
  `@authhero/adapter-interfaces`, `create-authhero` (and the apps it scaffolds), and
  `@authhero/widget` are **MIT** — using these packages on their own imposes no AGPL
  obligations on your code. Use of the AGPL-licensed packages remains subject to
  AGPL-3.0-only (or a commercial license).

  Versions published before this release remain available under their original MIT
  terms. See LICENSING.md in the repository for the full model, and CLA.md for the
  contributor agreement that keeps dual licensing possible.

### Patch Changes

- ee69820: Make the global `admin:organizations` org-membership bypass consistent across grants and adapters, and close a related privilege-escalation on the Drizzle adapter (#1198).
  - **Parity across all three org gates.** The refresh-token grant, token-exchange grant, and `calculateScopesAndPermissions` now share one `userHasGlobalOrgAdminPermission` helper. Previously the scopes-permissions gate only checked _role-derived_ global permissions, so a user granted `admin:organizations` **directly** (not via a role) passed the refresh-token gate but was still rejected with 403 once an `audience` was present. All three now honor both directly-assigned and role-derived global permissions, matched against the Management API audience.
  - **Drizzle `userRoles.list` scope fix (privilege escalation).** `list(..., "")` (global / tenant-level roles) guarded on truthiness, so the empty-string scope fell through to "all scopes" and returned the user's roles across _every_ organization. Consumers that read global roles this way — the `admin:organizations` bypass and the `globalRoles` bucket in `calculateScopesAndPermissions` — would therefore apply an **org-scoped** user's role permissions at the tenant level, letting an admin of a single organization mint a token carrying those permissions globally (e.g. listing every organization without any global grant). Only affected Drizzle (SQLite/D1) deployments; Kysely already scoped correctly. `list(..., "")` now filters `organization_id = ""`, matching Kysely and the documented contract (`undefined` = all scopes, `""` = global only, `"<id>"` = that org).
  - **Audience tightening in tenant provisioning.** `@authhero/multi-tenancy`'s global-admin check now requires `admin:organizations` to be granted on the Management API audience, so an identically named permission on an unrelated resource server can no longer masquerade as the global escape hatch.

  Note: this repairs the code paths, but a user must still actually hold `admin:organizations` on a global role/permission (and the tenant must enable `inherit_global_permissions_in_organizations`) to bypass org membership. A "tenant-admin"-style global role that lacks that specific permission is still rejected by design.

- Updated dependencies [47851c3]
- Updated dependencies [f1cbb4c]
- Updated dependencies [a5cb3a3]
  - @authhero/adapter-interfaces@4.3.0
  - @authhero/proxy@0.10.0

## 0.65.1

### Patch Changes

- c3c4546: chore: apply repo-wide Prettier formatting

  Formatting-only sweep, no behavior change. Generated output (Stencil loader/hydrate,
  drizzle-kit migration metadata, the built tailwind CSS blob) is now listed in
  `.prettierignore` so it is not reformatted on every build, and `lint-staged` runs in
  the pre-commit hook to keep formatting from drifting again.

- 089c6d2: Stop enforcing phone-number uniqueness across every provider (#1162).

  A phone number only _identifies_ a user on the passwordless `sms` connection;
  for every other provider it is ordinary profile data that people legitimately
  share (placeholder / switchboard / family numbers). The blanket
  `unique (phone_number, provider, tenant_id)` constraint therefore treated real,
  distinct users as duplicates.
  - `@authhero/kysely-adapter`: removed the `restore_unique_phone_provider`
    migration shipped in 11.21.0. Besides the wrong scope, its dedupe `DELETE`
    used a row-value `NOT IN` that exceeds PlanetScale's statement timeout (which
    is why production rolled it back and stayed intact). All environments have
    been cleaned of it, so it is deleted outright. The kysely baseline never
    carried a phone unique index.
  - `@authhero/drizzle`: removed the `unique_phone_provider` index from the
    SQLite/D1 schema so tenant D1s no longer reject non-`sms` signups that reuse a
    phone. Migrations were consolidated into a single fresh `0000_init`. The
    non-unique `users_phone_tenant_provider_index` lookup index and the
    `unique_email_provider` / `unique_username_provider` indexes are unchanged.
  - `authhero`: sms-phone uniqueness is now enforced at the application layer
    (Auth0-style, at lookup) on the management API user-create path, so creating a
    second `sms` user with an existing phone still returns 409 without relying on
    a database constraint.

- Updated dependencies [c3c4546]
  - @authhero/adapter-interfaces@4.2.1
  - @authhero/proxy@0.9.6

## 0.65.0

### Minor Changes

- be34110: Give `codes` a retention story so the table stops growing without bound (#1155).

  `codes` rows are short-lived by design but nothing ever pruned them, so every deployment accumulated them forever — one real deployment reached ~2.5M rows of which essentially 100% were expired.
  - `CodesAdapter` gains a required `cleanup(olderThan)` method, and `authhero` exports a `cleanupCodes(codes, { retentionDays })` helper to drive it from a scheduled handler, mirroring `cleanupOutbox`. **If you maintain a custom adapter, you must implement `cleanup`.**
  - The kysely adapter gains a `2026-07-16T12:00:00_codes_expires_at_ts` migration adding an indexed numeric `expires_at_ts` twin of `expires_at`, so sweeps no longer scan the table. It prunes already-expired rows _before_ adding the index, so it stays cheap on a table that has already grown large, and backfills the small remainder.
  - The drizzle adapter sweeps its existing indexed `expires_at` column and needs no migration. The AWS adapter is a no-op — DynamoDB already expires codes via a native `ttl`.

  Scheduling `cleanupCodes` is what keeps the table in check; the migration is a one-time catch-up. See the new Data Retention deployment guide for the full set of tables that need sweeping.

### Patch Changes

- Updated dependencies [be34110]
  - @authhero/adapter-interfaces@4.2.0
  - @authhero/proxy@0.9.5

## 0.64.0

### Minor Changes

- 32ceb43: feat(pagination): checkpoint (from/take + opaque next cursor) on GET /users, and align the default page size with Auth0 (#1098)
  - `GET /users` now supports keyset (checkpoint) pagination via `from`/`take`, returning `{ users, next }` with an opaque cursor that is absent on the last page. This is a deliberate superset of Auth0, which only offers offset paging on /users and caps it at 1000 results — full-tenant walks no longer need export jobs. Offset paging (`page`/`per_page` + totals) is unchanged.
  - In checkpoint mode, `q` filters stay in effect and `created_at` asc/desc is sortable (`user_id` is the unique tiebreaker). The cursor records the sort it was minted under; replaying it with a different sort returns 400. Unsupported sort columns return 400.
  - Linked accounts remain folded into their primary user's `identities` during cursor walks and never appear as top-level rows.
  - The default page size for offset pagination is now 50 (was 10), matching Auth0's documented default. Requests that pass an explicit `per_page` are unaffected.
  - kysely: the shared keyset helper now accepts table-qualified sort/id columns for queries with joins.

### Patch Changes

- Updated dependencies [32ceb43]
  - @authhero/adapter-interfaces@4.1.0
  - @authhero/proxy@0.9.4

## 0.63.1

### Patch Changes

- dd16e55: Apply the `q` filter to the totals count in the tenants adapter's list method. Previously `include_totals` returned the full table count even when `q` filtered the rows.
- 47db71e: Security dependency bumps for open Dependabot alerts:
  - `@authhero/saml`: fast-xml-parser `^4.5.1` → `^4.5.5` (DOCTYPE entity-encoding bypass, entity-expansion DoS) and @xmldom/xmldom 0.8.13 via xml-crypto (XML injection in serialization)
  - `@authhero/drizzle`: drizzle-orm `^0.44.2` → `^0.45.2` (SQL injection via improperly escaped identifiers)
  - `@authhero/aws-adapter`: @aws-sdk/client-dynamodb and @aws-sdk/lib-dynamodb `^3.700.0` → `^3.1085.0` (pulls patched fast-xml-parser 5.x)
  - `authhero`: regenerated client bundle against hono 4.12.30 (CORS middleware reflected any Origin with credentials when origin defaulted to wildcard)

## 0.63.0

### Minor Changes

- 5ede4a0: Add `GET /roles/{id}/users` to the management API with Auth0-style checkpoint pagination

  The endpoint returns the distinct users assigned to a role (per-organization assignments collapsed), as user summaries (`user_id`, `email`, `name`, `picture`). It supports the bare array, `include_totals` and checkpoint (`from`/`take` + opaque `next` cursor) response shapes, matching Auth0 — which requires checkpoint pagination on this endpoint past 1000 results.

  Breaking (adapter-interfaces): `UserRolesAdapter` gains a required `listUsers(tenantId, roleId, params)` method, so custom adapter implementations must add it. It is implemented with keyset pagination in the kysely and drizzle adapters. The aws/DynamoDB adapter throws an explicit not-implemented error (its key layout has no index by role), mirroring the actions adapters.

### Patch Changes

- Updated dependencies [da635f1]
- Updated dependencies [5ede4a0]
  - @authhero/adapter-interfaces@4.0.0
  - @authhero/proxy@0.9.3

## 0.62.1

### Patch Changes

- Updated dependencies [dbb6e70]
  - @authhero/adapter-interfaces@3.12.0
  - @authhero/proxy@0.9.2

## 0.62.0

### Minor Changes

- 953739e: `GET /clients` now supports true keyset (checkpoint) pagination with an opaque `next` cursor.

  Auth0 documents `/clients` as a checkpoint endpoint, but our implementation treated `from` as a numeric SQL offset and never returned `next`. The kysely and drizzle adapters now branch to the shared keyset paginator (created_at desc, client_id tiebreaker) when `from`/`take` is present, and the endpoint returns `{ clients, next }` in that mode. Offset pagination (`page`/`per_page` + `total`), used by the admin UI, is unchanged.

  The drizzle adapter's list response is also aligned with the adapter contract: totals are now returned as a nested `totals` object (previously flattened and dropped by the management API), `length` reflects the returned page rather than the total count, and the `include_totals` count now honors the `q` filter.

- 4a549c2: `GET /logs` now supports true keyset (checkpoint) pagination with an opaque `next` cursor.

  Auth0 documents `/logs` as a checkpoint endpoint, but our implementation only supported `page`/`per_page` offsets. The kysely and drizzle adapters now branch to the shared keyset paginator (date desc by default, log_id tiebreaker) when `from`/`take` is present, and the endpoint returns `{ logs, next }` in that mode. As a superset of Auth0 — which ignores `q`/`sort` under `from`/`take` on `/logs` — `q` and `from_date`/`to_date` filters stay in effect during a cursor walk, and sorting by `date` (asc/desc) is honored; other sort columns are rejected with a 400 rather than silently ignored.

  To make sort-aware cursors safe, the cursor payload gains an optional sort-key field (`k`): a token minted under one sort that is replayed under a different sort is rejected with a 400 instead of returning pages from the wrong position.

  The management API error handler now duck-types HTTPException-like errors (numeric `status` + `getResponse`) instead of `instanceof HTTPException`, so 4xx errors thrown inside the bundled kysely/drizzle adapters map to proper HTTP responses rather than escaping as 500s.

### Patch Changes

- 5dc1e8d: Stop bundling private copies of shared dependencies into the adapter dists.

  Rollup's `external` array does exact string matching, so subpath imports slipped into the bundles even when the bare package was listed: kysely inlined `hono/http-exception`, parts of `kysely` itself, and the whole `@authhero/proxy` workspace dep; aws inlined `hono/http-exception` and `nanoid`; drizzle had no externals at all and bundled everything (dist shrinks from ~520 kB to ~172 kB). All three configs now use a subpath-aware external function, the same pattern `@authhero/multi-tenancy` and `@authhero/cloudflare` already use.

  The user-visible consequence of the old behavior: HTTPExceptions thrown inside an adapter had a different class identity than the host app's `HTTPException`, so `instanceof` checks in error handlers failed and adapter-thrown 4xx errors could surface as 500s. Fresh builds now share the host's hono. (The management API also duck-types these errors since the `GET /logs` keyset PR, so older published adapter versions remain handled.)

- 0a32dd3: Fix runtime crash in the ESM bundle when creating connections, organizations, resource servers, invites, or hooks. Five adapters loaded nanoid with a lazy `require("nanoid")`, which worked while nanoid was bundled into the dist but throws under Node ESM now that nanoid is external. Replaced with top-level ESM imports.
- 7fb85fb: Extract the SQL-adapter helpers that were duplicated between the kysely and drizzle packages into @authhero/adapter-interfaces. The SQL-specific helpers — date conversion (dbDateToIso, isoToDbDate, convertDatesToAdapter, nowIso) and row/entity transforms (stringifyProperties, booleanToInt, removeUndefinedAndNull, removeNullProperties, stringifyIfDefined, getCountAsInt) — are published under the new `@authhero/adapter-interfaces/sql` subpath so they stay out of the main adapter-contract surface; the Lucene query sanitizer (sanitizeLuceneQuery) lives in the main export since any adapter implementing the `list({ q })` contract needs it. The kysely and drizzle modules re-export the shared implementations, so their public APIs are unchanged.
- Updated dependencies [4a549c2]
- Updated dependencies [7fb85fb]
  - @authhero/adapter-interfaces@3.11.0
  - @authhero/proxy@0.9.1

## 0.61.0

### Minor Changes

- 0e6acf4: Add Auth0-style keyset (checkpoint) pagination with an opaque `next` cursor.

  List endpoints previously treated the `from` parameter as a numeric SQL offset, which diverges from Auth0 (where `from` is the opaque `next` token from the prior response) and is unstable under concurrent writes. Organization and organization-members listing now support true keyset pagination:
  - `adapter-interfaces` exposes `encodeCursor`/`decodeCursor` and a `next` field on the list-response contract. `from` is documented as an opaque cursor.
  - kysely and drizzle gain a shared keyset paginator (`(sortColumn, id)` row-value comparison, `take + 1` look-ahead to emit `next`). Offset pagination (`page`/`per_page` + `total`), used by the admin UI, is unchanged.
  - `GET /organizations`, `GET /organizations/{id}/members` and `GET /client-grants` return `{ items, next }` when called with `from`/`take`, and keep the offset shape for `page`/`per_page`. These are the endpoints Auth0 documents as checkpoint pagination.

  This fixes `GET /organizations/{id}/members` being capped at 10 (the Auth0 SDK sends `from`/`take`) and lets clients page the full set via the cursor. `client-grants` previously faked keyset by translating `from` into a `id:>` filter and never returned `next`; it now uses the shared paginator. The admin UI's org-members view switches to offset pagination so it keeps numbered pages and totals.

  Other list endpoints keep offset pagination unchanged; they can adopt the shared keyset helper later without a contract change.

### Patch Changes

- Updated dependencies [0e6acf4]
- Updated dependencies [11ef0a5]
  - @authhero/adapter-interfaces@3.10.0
  - @authhero/proxy@0.9.0

## 0.60.0

### Minor Changes

- 4867c22: Make the outbox transactional: hook events now commit atomically with the user write (#1057).

  Previously the `hook.post-user-registration` / `hook.post-user-deletion` outbox event was written as a standalone insert _after_ the user commit closed, then awaited by the outbox middleware with `Promise.allSettled` + `console.error`. A failed enqueue — or a worker crash/eviction between the two writes — silently dropped the event, so the outbox pattern's defining guarantee ("business row and event row commit together or not at all") did not hold.
  - **adapter-interfaces**: `rawCreate`, `update`, and `remove` accept an optional `WriteOptions.outboxEvents` (a new `OutboxEventInsert` — an audit event with a caller-assigned `id`). Adapters must persist these in the same atomic unit as the business write.
  - **drizzle**: the companion outbox insert is appended to the existing `runAtomic` batch, so on D1 the user row and its event land in a single `db.batch()` (and one `BEGIN/COMMIT` on better-sqlite3). On `remove`, the companion event is only appended when the primary user actually exists (checked via the same pre-batch read that collects linked IDs), so deleting a non-existent user can't strand an orphaned `hook.post-user-deletion` event. Also fixes a latent bug where `outbox.create` wrote `undefined` into the NOT NULL `aggregate_type`/`aggregate_id` columns — these now derive from the event's `target`, matching kysely.
  - **kysely**: the companion event is inserted inside the same transaction as the user write.
  - **authhero**: the post-registration event is built in `commitUserHook` from the committed user and the post-deletion event is passed into `remove`, then relayed for delivery only after the write commits. A race-loser whose `rawCreate` rolls back no longer strands an event. When the outbox is not configured, dispatch still falls back to inline webhook invocation.

  Behavior change: the `hook.post-user-registration` payload now describes the committed user rather than the post-template-hook result, so mutations made by post-registration hooks (e.g. `account-linking`) are no longer reflected in that event's payload.

### Patch Changes

- Updated dependencies [4867c22]
  - @authhero/adapter-interfaces@3.9.0
  - @authhero/proxy@0.8.5

## 0.59.0

### Minor Changes

- ab4c324: Remove `themes.list` from the ThemesAdapter interface and its kysely/drizzle/aws implementations. Auth0 only supports a single "default" theme per tenant and nothing besides the tenant export used `list`, so the export now reads `themes.get(tenant_id, "default")` instead. This also fixes tenant export failing with `themes.list is not a function` against deployments that override the themes adapter with a partial implementation (e.g. a vendor-settings-backed one that only implements `get`/`create`/`update`/`remove`).

### Patch Changes

- 2c5c014: Fix data.transaction() throwing on Cloudflare D1. The generic transaction wrapper (and actionVersions.create) issued raw BEGIN/COMMIT/ROLLBACK, which D1 rejects, so every flow wrapping writes in data.transaction() (user create, link-users, register, logout, ...) failed with a 500. The wrapper now feature-detects batch-capable drivers the same way runAtomic does: on D1 the callback runs directly (non-atomic, same as useTransactions: false) while per-adapter multi-statement writes stay atomic via db.batch(); better-sqlite3 keeps interactive transactions. actionVersions.create now routes its deployed-clear + insert through runAtomic.
- Updated dependencies [378e918]
- Updated dependencies [e358192]
- Updated dependencies [ab4c324]
  - @authhero/adapter-interfaces@3.8.0
  - @authhero/proxy@0.8.4

## 0.58.1

### Patch Changes

- b83ae9f: Surface the `spm` (Success Password Migration) log type: add a `password-migrations` analytics resource (`GET /api/v2/analytics/password-migrations`) backed by the drizzle, kysely, and Analytics Engine adapters, show it as "Password Migrations" on the admin analytics page, add `spm` to the admin logs type filter, and sort both the logs type filter and the analytics resource dropdown alphabetically.
- Updated dependencies [b83ae9f]
  - @authhero/adapter-interfaces@3.7.0
  - @authhero/proxy@0.8.3

## 0.58.0

### Minor Changes

- 6258d34: Add the grants adapter (per-user OAuth consent storage), mirroring the kysely implementation. Without it the universal-login consent screen fails closed with access_denied — surfaced by the OIDC conformance suite's oidcc-refresh-token module after the conformance auth-server switched to the drizzle adapter. Ships migration 0001 creating the grants table.
- 5b50504: Add control-plane data model for durable tenant lifecycle operations (issue #1026): new `tenant_operations`, `tenant_operation_events` (append-only), and `rollouts` entities with optional `tenantOperations`, `tenantOperationEvents`, and `rollouts` adapters in `DataAdapters`. The tenant row's provisioning fields remain the current-state snapshot; these tables are the history explaining how it got there.

  These are control-plane-only tables. In the drizzle adapter they live in a separate `drizzle-control-plane/` migration set (own journal; apply with `migrationsTable: "__drizzle_migrations_control_plane"`) so WFP tenant D1s — which apply everything in `drizzle/` — never get them, and `createAdapters(db, { controlPlane: true })` opts a control-plane deployment into the new adapters. The kysely adapter (control-plane databases only) carries them in its normal migration chain.

### Patch Changes

- Updated dependencies [5b50504]
  - @authhero/adapter-interfaces@3.6.0
  - @authhero/proxy@0.8.2

## 0.57.0

### Minor Changes

- fb431a9: Bring drizzle to parity with the user_activity split (issue #1003): new `user_activity` table (regenerated 0000 baseline) and `userActivity` adapter (`get`/`upsert`), users get/list LEFT JOIN the counters (missing row = never logged in), create/update route `last_login`/`last_ip`/`login_count` to `user_activity`, and the legacy columns are dropped from the `users` schema. Filtering/sorting on activity fields via `q`/`sort` resolves against the joined table.

## 0.56.3

### Patch Changes

- Updated dependencies [028f2b5]
  - @authhero/adapter-interfaces@3.5.0
  - @authhero/proxy@0.8.1

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
