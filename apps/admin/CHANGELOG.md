# @authhero/admin

## 0.20.2

### Patch Changes

- 58d3772: Bump `recharts` to `^3.10.1` so every app in the monorepo shares one version.
- Updated dependencies [5b5d019]
- Updated dependencies [1376877]
  - @authhero/adapter-interfaces@4.11.0

## 0.20.1

### Patch Changes

- Updated dependencies [fb874ea]
  - @authhero/adapter-interfaces@4.10.0

## 0.20.0

### Minor Changes

- 527ed6a: Manage SAML certificates from the management API and the admin console

  The signing-key endpoints only ever addressed the `jwt_signing` bucket, so a
  SAML certificate could only be replaced by editing the database by hand. They
  now take a `type` query parameter (`jwt_signing` by default, so existing
  callers are unaffected) and can operate on `saml_encryption` keys.
  - `POST /api/v2/keys/signing/rotate` accepts `validity_days`, `activate_in_days`
    and `grace_days`. A key whose `current_since` is in the future is _staged_: it
    is published immediately — in JWKS, and as an extra `KeyDescriptor` in the
    SAML metadata — but does not sign until it activates. That is what makes a
    zero-downtime rotation possible for a SAML service provider, which cannot
    fetch a new certificate on its own and has to be sent one. It returns the new
    key as JSON instead of `OK`.
  - `POST /api/v2/keys/signing/{kid}/renew` re-issues a certificate over the
    existing key pair. The public key, and therefore the `kid`, is unchanged, so
    anything validating against the public key it already holds keeps working.
  - SAML certificates now default to a five-year lifetime; JWT signing keys stay
    at one year. Both can be overridden per request.
  - SAML certificates always resolve with tenant semantics — the tenant's own key
    first, the shared control-plane key as a fallback — regardless of
    `signingKeyMode`, which exists for JWT keys where a shared key is a sane
    default. A SAML certificate is published in one tenant's IdP metadata and
    pinned by that tenant's service providers, so a shared one couldn't be rotated
    without forcing unrelated tenants' providers to re-trust at the same moment.
    Deployments whose `saml_encryption` row has no `tenant_id` are unaffected:
    with no tenant-scoped key to prefer, the fallback is the only candidate.
    Stamping a `tenant_id` on that row hands ownership — and the console's
    rotate/renew buttons — to that tenant.
  - The SAML signing and metadata paths resolve keys through `resolveSigningKeys`
    instead of taking the first row of an unsorted list, so during a rotation's
    grace period the assertion is signed by the current key rather than whichever
    row the database returned first.
  - Control-plane keys are inherited, not owned: a tenant sees them and verifies
    with them, but `rotate`, `renew` and `revoke` return 403. A key counts as
    inherited when it carries no private material (a public-only copy projected
    from the control plane) or when it is a shared control-plane key seen by a
    tenant that isn't the control plane, decided by the same
    `multiTenancyConfig.controlPlaneTenantId` the tenants route uses for access
    control. Deployments that set no control-plane tenant are single-tenant and
    keep managing their unscoped keys as before. Previously any tenant with
    `update:signing_keys` could revoke the shared key every other tenant was
    verifying against, or revoke a projected copy and sever verification of the
    tokens the control plane keeps issuing.
  - `GET /api/v2/keys/signing` reports each certificate's `expires_at`/`expired`,
    flags the key that is actually signing, lists the inherited keys a tenant
    falls back to, and no longer returns `pkcs7`. Private key material was never
    meant to leave the server.
  - New certificates fall back to a sensible subject when `ORGANIZATION_NAME` is
    unset, instead of `CN=undefined`.

  In the admin console, Signing Keys splits into JWT and SAML tabs, shows each
  certificate's expiry (red inside 60 days, and flagged once expired) and its
  scope, and offers Rotate, Renew, and a certificate dialog with the PEM and
  fingerprints to hand to a service provider. Inherited keys are labelled as such
  and offer no mutating actions.

## 0.19.3

### Patch Changes

- 0472ec4: Link-user dialog searches by scoped email instead of free text

  Searching a full email address in the "Link user" dialog now sends
  `q=email:"…"` rather than a bare term, so the API resolves it with an indexed
  lookup instead of a substring scan over the tenant's users. Partial input still
  uses the free-text search.

- Updated dependencies [0472ec4]
- Updated dependencies [c039bb9]
- Updated dependencies [95f091a]
- Updated dependencies [a748f96]
  - @authhero/adapter-interfaces@4.9.0

## 0.19.2

### Patch Changes

- Updated dependencies [285af35]
  - @authhero/adapter-interfaces@4.8.1

## 0.19.1

### Patch Changes

- Updated dependencies [6d82d84]
  - @authhero/adapter-interfaces@4.8.0

## 0.19.0

### Minor Changes

- 38afecc: Forms: support the Auth0-standard `{{fields.<field_id>}}` syntax in flow templates (alongside the existing `{{$form.*}}` alias), and expose an editable Field ID in the form designer's field component editors so flows can reference readable IDs like `phone_number` instead of auto-generated ones.

### Patch Changes

- e158294: Fix the form designer's user-attribute picker to match where data is actually stored, and add an attribute picker to field default values.
  - Birthdate and Gender are root-level OIDC claims on the user profile, but the router-condition field picker listed them under `user_metadata.*`. Rules built from those entries never matched users whose values were written by UPDATE_USER flow actions (which write root-level keys), so completed forms were shown again on every login. They now emit `{{context.user.birthdate}}` / `{{context.user.gender}}`, alongside a new `{{context.user.address.country}}` option. The trap entries `user_metadata.address` and `user_metadata.phone` (shadowing the root `address` and `phone_number` claims) were removed.
  - Field components (text-like and date) now have a picker on the Default value input that inserts `{{context.user.…}}` templates, so prefilling fields from the user profile no longer requires hand-typing template syntax.

## 0.18.0

### Minor Changes

- 060b2d5: Restrict form hooks to the `post-user-login` trigger, the only trigger that dispatches them.

  `handleFormHook` is called from `postUserLoginHook` and nowhere else, but `formHookAllowedTriggers` accepted six triggers. A form hook on `pre-user-registration`, `post-user-registration`, `validate-registration-username`, `pre-user-deletion` or `post-user-deletion` was accepted by the management API, listed as enabled in the admin UI, and then never ran — indistinguishable from a form that is simply broken. The other triggers can't support a form hook: they run as decorators on `users.create` / `users.update` / `users.remove` (so they also fire for the management API, SCIM and tenant imports) and return a `User` rather than a `Response`, leaving no channel for the redirect a form hook depends on.
  - `formHookAllowedTriggers` is narrowed to `post-user-login`, so `POST /api/v2/hooks` now rejects the rest with a 400 instead of storing a hook that can't run.
  - `PATCH /api/v2/hooks/{id}` re-checks the trigger against the stored row, via the new `allowedTriggersForHook` helper. The body schema is a union of _partial_ variant schemas, so a patch carrying only `trigger_id` matches whichever member has no required field left and the stored hook's type is otherwise invisible to it. Only a _change_ is rejected: a row stored on a now-unsupported trigger can still be edited (and disabled), it just can't be moved further.
  - The admin UI narrows the trigger list per hook type in both the create form and the details tab — form and page hooks to `post-user-login`, code hooks to the four triggers they support. A hook already stored on an unsupported trigger keeps it as a flagged choice so the rest of the record stays editable.

  To collect data from new users, put the form hook on `post-user-login`: it runs on the first login immediately after signup, with the user created and the login session live.

### Patch Changes

- cb763af: Open the form designer by default when viewing a form instead of the details tab, and pick flows by name from a dropdown in the flow node and ending editors instead of typing a flow ID
- Updated dependencies [060b2d5]
- Updated dependencies [9c9fefe]
- Updated dependencies [bed0939]
  - @authhero/adapter-interfaces@4.7.0

## 0.17.0

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

## 0.16.3

### Patch Changes

- Updated dependencies [8b3e137]
- Updated dependencies [c0d148a]
  - @authhero/adapter-interfaces@4.5.0

## 0.16.2

### Patch Changes

- 7c3f0f1: Add a "Show last used badge" toggle to the prompts Settings tab so `show_last_used_connection` can be enabled per tenant from the admin UI instead of only via the Management API.

## 0.16.1

### Patch Changes

- Updated dependencies [5b31dcc]
- Updated dependencies [b7f67aa]
- Updated dependencies [52811ff]
- Updated dependencies [8af3eab]
  - @authhero/adapter-interfaces@4.4.0

## 0.16.0

### Minor Changes

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

- Updated dependencies [47851c3]
- Updated dependencies [f1cbb4c]
- Updated dependencies [a5cb3a3]
  - @authhero/adapter-interfaces@4.3.0

## 0.15.3

### Patch Changes

- cda9179: Fix permissions search on the role and user permissions tabs. The `q` search query was written to the URL but ignored by the data provider, so typing in the search box never filtered the list. The role- and user-permissions branches now route through the shared client-side list handler, filtering on permission name, description, and resource server, and gain client-side sorting.

## 0.15.2

### Patch Changes

- Updated dependencies [c3c4546]
  - @authhero/adapter-interfaces@4.2.1

## 0.15.1

### Patch Changes

- Updated dependencies [be34110]
  - @authhero/adapter-interfaces@4.2.0

## 0.15.0

### Minor Changes

- 467b4b0: Add the RFC 8693 token-exchange grant (`urn:ietf:params:oauth:grant-type:token-exchange`) to the client Grant Types picker. The token endpoint enforces the client's `grant_types` allowlist, so an org-scoped token exchange was rejected with `unauthorized_client` unless the grant was added via `PATCH /api/v2/clients/{id}` by hand. Clients that already carry the grant now show it as enabled instead of silently omitting it. Companion to the Organizations tab — enabling org-scoped token exchange is now fully reachable from the dashboard.

## 0.14.0

### Minor Changes

- e2dcd53: Add an Organizations tab to the client (application) edit screen exposing `organization_usage` (Deny/Allow/Require) and `organization_require_behavior` (No prompt/Pre-login/Post-login). These were previously only editable via raw JSON, but are required to enable org-scoped token exchange (a `Deny` client is rejected with `unauthorized_client`).

## 0.13.0

### Minor Changes

- 3e450c5: Let tenant admins manage their own team (#1137). A tenant's administrators are
  control-plane organization members — rows a tenant shard cannot write — so this
  adds a `TenantMembersBackend` seam with two implementations: a local one
  (`createLocalTenantMembersBackend`) that resolves the org and mutates the
  control-plane database directly (single-instance / control-plane deployments),
  and a control-plane-backed one (`createControlPlaneTenantMembersAdapter`) that
  delegates over the shared control-plane client for Workers-for-Platforms shards.

  Server-side:
  - New `/api/v2/tenant-members` management resource (list/add/remove members,
    member roles, and invitations). Every request is pinned to the caller's
    `org_name` claim server-side — a tenant-A admin cannot manage tenant B by
    swapping the `tenant-id` header.
  - New authoritative `/api/v2/proxy/control-plane/tenant-members` resource
    (gated by the `controlplane:tenant_members` scope), which re-pins the org
    from the verified service token's `tenant_id` claim — a second, independent
    check. Enable it via `proxyControlPlane.tenantMembers`; enable the tenant
    resource via the top-level `tenantMembers` config.

  Admin UI: a new **Team** page in the per-tenant admin lets tenant admins invite
  colleagues by email, remove admins, and edit each admin's roles. The invitation
  client is resolved server-side, fixing the control-plane page's "invite UI
  silently disappears when the client id isn't in local storage" foot-gun.

  Also adds an optional `proxyControlPlane.isTrustedIssuer(iss)` predicate (#1139)
  that widens the accepted control-plane token issuers to a deployment's own
  Workers-for-Platforms tenant subdomains — needed so a shard whose tokens are
  signed by its own key (issuer `https://{tenant}.{host}/`) can authenticate the
  write-through to the control plane. It is consulted before any JWKS fetch, so
  the SSRF guarantee holds, and applies to every mounted resource (custom-domains,
  tenant-members, sync).

## 0.12.1

### Patch Changes

- 495772e: Only show relevant fields in the user create form based on the selected connection: password (and username when the connection requires it) for database connections, email for passwordless email, and phone number for passwordless SMS. The connection dropdown now only lists database and passwordless connections, and extra profile fields (name, birthdate, picture, etc.) moved out of the create form — they remain editable on the user detail view.
- Updated dependencies [32ceb43]
  - @authhero/adapter-interfaces@4.1.0

## 0.12.0

### Minor Changes

- cd71b11: Expose more user fields as toggleable columns in the users list. The table previously offered only email, phone number, connection, login count and last login; it now also defines user_id, name, username, given/family name, nickname, email verified, provider, locale, birthdate, address, last IP, created_at and updated_at. The new columns are hidden by default and can be enabled per user via the existing Columns button. birthdate and address are not sortable because the management API's user sort allowlist does not include them.

### Patch Changes

- 456a98e: Fix removing an organization member failing with a 404. The data provider split the delete record id on `_` to recover a composite `<orgId>_<userId>` id, but organization ids themselves start with `org_`, so the request was sent to `/organizations/org/members` with a mangled user id. The organization id and member ids are now always resolved from the record fields in `previousData`.

## 0.11.9

### Patch Changes

- Updated dependencies [da635f1]
- Updated dependencies [5ede4a0]
  - @authhero/adapter-interfaces@4.0.0

## 0.11.8

### Patch Changes

- Updated dependencies [dbb6e70]
  - @authhero/adapter-interfaces@3.12.0

## 0.11.7

### Patch Changes

- Updated dependencies [4a549c2]
- Updated dependencies [7fb85fb]
  - @authhero/adapter-interfaces@3.11.0

## 0.11.6

### Patch Changes

- 161cdc9: Fix global search crashing user lookups. The search box issued every resource query with a hardcoded `sort: { field: "id" }`, but the `users` resource has no `id` column (only `user_id`), so a search emitted `sort=id:1` and the users endpoint failed with "Unknown column 'id' in 'order clause'". Sort field is now per-resource, defaulting to `id` and using `user_id` for users.
- Updated dependencies [0e6acf4]
  - @authhero/adapter-interfaces@3.10.0

## 0.11.5

### Patch Changes

- Updated dependencies [4867c22]
  - @authhero/adapter-interfaces@3.9.0

## 0.11.4

### Patch Changes

- 9dbf39a: Add a consistent "Raw JSON" tab to admin detail screens that were missing it: sessions, email providers, email templates, flows, resource server scopes, resource servers, settings, actions, attack protection, branding, MFA, and prompts.

  Consolidate the redundant read-only session edit view into the session show view (sessions are now viewed via `/sessions/:id/show`).

- 2f62e0b: User permissions can now be scoped to an organization from the management API and admin UI. The `POST`/`DELETE` `/users/{user_id}/permissions` endpoints accept an optional `organization_id` per permission (previously ignored, which made organization-scoped permissions impossible to assign or remove). The admin user permissions tab shows an "Organization" column and lets you pick an organization when assigning permissions.

## 0.11.3

### Patch Changes

- c72ddd2: Fix the connection create form so the "Password" option sets the strategy to the canonical Auth0 database value `auth0` instead of the connection name `Username-Password-Authentication`.

## 0.11.2

### Patch Changes

- 378e918: Recognize every spelling of the database-connection strategy and write the Auth0-canonical value on new connections.
  - `@authhero/adapter-interfaces` exports `DATABASE_CONNECTION_STRATEGY` (`"auth0"`, what Auth0 stores on database connections) and `isDatabaseConnectionStrategy()`, which matches the canonical `"auth0"` plus the two legacy spellings still present in existing data: `"Username-Password-Authentication"` (the connection name reused as strategy) and `"auth2"` (the legacy provider literal).
  - All readers that detect a password connection — universal-login screens, password/ticket/dbconnections flows, callback error routing, and the admin UI — now use the tolerant matcher instead of comparing against the exact `"Username-Password-Authentication"` string. Tenants whose connection rows carry a legacy strategy value get correct password-login behavior everywhere.
  - `seed()` now creates the database connection with `strategy: "auth0"` (name stays `"Username-Password-Authentication"`), matching Auth0's management API shape.

  This is the prerequisite for backfilling existing connection rows to `strategy = "auth0"`: once this version is deployed, the backfill is a plain UPDATE and no reader depends on the old spellings.

- Updated dependencies [378e918]
- Updated dependencies [e358192]
- Updated dependencies [ab4c324]
  - @authhero/adapter-interfaces@3.8.0

## 0.11.1

### Patch Changes

- 6ffefb4: Never create users with the legacy "auth2" provider — new username/password users are always stamped with "auth0".
  - `resolveUsernamePasswordProvider` now defaults to `"auth0"` when no `usernamePasswordProvider` resolver is configured; return `"auth2"` from the resolver to pin a tenant on the legacy value during a staged cutover.
  - The management API `POST /users` no longer derives the provider from a database connection's `strategy` field (which legacy tenants persist as the `"auth2"` literal) and no longer honors a caller-supplied `"auth2"` provider — database users always get the tenant's resolved username-password provider.
  - The exported `USERNAME_PASSWORD_PROVIDER` constant changed from `"auth2"` to `"auth0"`; seeding and the `ensureUsername` pre-defined hook now create `auth0|*` accounts, while their lookups keep matching existing `auth2|*` rows so no duplicates are created.
  - The admin UI user-create form treats connections whose strategy is stored as `"auth2"`/`"auth0"` as password connections and always submits `provider: "auth0"`.

  Reads remain dual-provider: existing `auth2|*` users keep resolving and logging in.

- b83ae9f: Surface the `spm` (Success Password Migration) log type: add a `password-migrations` analytics resource (`GET /api/v2/analytics/password-migrations`) backed by the drizzle, kysely, and Analytics Engine adapters, show it as "Password Migrations" on the admin analytics page, add `spm` to the admin logs type filter, and sort both the logs type filter and the analytics resource dropdown alphabetically.
- Updated dependencies [b83ae9f]
  - @authhero/adapter-interfaces@3.7.0

## 0.11.0

### Minor Changes

- c94ef71: Add a control-plane Operations page per tenant (issue #1026 phase 5): lifecycle operation history with expandable step-event timelines, live polling while an operation is in flight, and a Redeploy button that enqueues an upgrade operation. The data provider gains `listTenantOperations` / `getTenantOperation` / `createTenantOperation`, and the tenants list links to the new page. Full-page loads of `/tenants/:id/members` and `/tenants/:id/operations` now render the control-plane app correctly.

### Patch Changes

- d90f51a: Standardize agent instruction files on CLAUDE.md. Replaces the stale
  `packages/ui-widget/agent.md` (which still described the abandoned Ory Kratos
  schema direction) with a lean CLAUDE.md documenting the actual Auth0 Forms
  schema, and trims `apps/admin/AGENTS.md` bootstrap boilerplate into a
  CLAUDE.md with the repo-relevant conventions. Docs only, no runtime changes.
- Updated dependencies [5b50504]
  - @authhero/adapter-interfaces@3.6.0

## 0.10.6

### Patch Changes

- 54e1a96: Fix the admin UI calling http://localhost:3000/oauth/token when served from an https auth server. buildUrlWithProtocol now follows the page's own protocol for same-origin domains and defaults other schemeless domains to https instead of forcing http for loopback hosts; an explicit http:// URL is still respected for local servers.

## 0.10.5

### Patch Changes

- Updated dependencies [028f2b5]
  - @authhero/adapter-interfaces@3.5.0

## 0.10.4

### Patch Changes

- Updated dependencies [8c75922]
  - @authhero/adapter-interfaces@3.4.1

## 0.10.3

### Patch Changes

- Updated dependencies [9b7879c]
  - @authhero/adapter-interfaces@3.4.0

## 0.10.2

### Patch Changes

- Updated dependencies [780d524]
  - @authhero/adapter-interfaces@3.3.0

## 0.10.1

### Patch Changes

- Updated dependencies [6d19200]
  - @authhero/adapter-interfaces@3.2.0

## 0.10.0

### Minor Changes

- 02449c8: Analytics page: add a custom date-range picker (quick presets + two-month calendar) and a separate bucket-size selector (Auto/Hour/Day/Week/Month), decoupling granularity from the time range so monthly active users are now visible. Chart axis and tooltip labels now adapt to the selected interval (e.g. hourly buckets show the hour instead of just the date).

### Patch Changes

- 02449c8: Resolve the client "Login" link's custom domain on click instead of from the eagerly-listed custom domains. The list endpoint returns the stored (often stale "pending") status, so the link always fell back to the token domain; fetching the domain on click triggers the Cloudflare-backed status sync and uses the custom domain when it is actually "ready".

## 0.9.1

### Patch Changes

- c76247b: Add a JSON/raw view to the branding Themes tab so the full theme can be copied and edited as JSON

## 0.9.0

### Minor Changes

- 44e8c0d: Admin UI can now address tenant-scoped management API calls via per-tenant
  subdomains (`{tenant_id}.{apiHost}`) instead of the `tenant-id` header. Enable
  per domain in the domain selector ("Use tenant subdomains") or globally via the
  `VITE_USE_TENANT_SUBDOMAINS=true` config. Control-plane calls (tenant
  list/create) continue to use the apex host. The `tenant-id` header is still sent
  alongside for backward compatibility, and loopback/IP hosts (local dev)
  automatically fall back to the apex + header path.

## 0.8.0

### Minor Changes

- b783b34: Add a "try" action for webhooks so they can be triggered manually for a specific user.
  - New management API endpoint `POST /api/v2/hooks/{hook_id}/try` (authhero extension; not in Auth0). Takes `{ user_id }`, invokes the webhook through the same code path as a real trigger (service-token Bearer auth, stripped user payload, SUCCESS_HOOK/FAILED_HOOK logging) and returns the upstream response `{ ok, status, body?, error? }`. Disabled hooks can be tried, so a webhook can be verified before enabling it.
  - `invokeWebHook` is exported from `hooks/webhooks.ts` as the single-hook invoker returning the response details; `invokeHooks` now delegates to it per hook with unchanged behavior.
  - Admin UI: the hook edit page shows a "Try" button for web hooks that opens a dialog to search for a user and trigger the webhook, displaying the upstream response status and body.

## 0.7.0

### Minor Changes

- e0d6e50: Remove the unused `provisioner` field from `AuthHeroConfig`, along with the unreferenced `NoopTenantProvisioner` class and `TenantProvisioner` / `TenantProvisionerContext` types. The real WFP provisioning path is the `databaseIsolation.onProvision` hook on `createMultiTenancyPlugin` from `@authhero/multi-tenancy`, wired via `createWfpTenantProvisioningHook` from `@authhero/cloudflare-adapter`. The deleted field was declared but never read by anything in this repo.

  The admin tenant list now shows `deployment_type` and `provisioning_state` columns so wfp tenants stuck in `pending` / `failed` are visible at a glance, with the `provisioning_error` shown on hover.

## 0.6.6

### Patch Changes

- aedf807: Add a revoke button to the user grants tab so tenant operators can review and revoke OAuth consents from the admin UI.
- aedf807: Add a Danger zone to the tenant settings Advanced tab with a confirmation-gated delete button, hide the default delete button at the top of the settings edit page, and fix the access check on `DELETE /tenants/{id}` so tokens carrying an `org_name` claim that matches the target tenant pass without a redundant control-plane membership lookup (which was rejecting valid org-scoped tokens).
- Updated dependencies [aedf807]
  - @authhero/adapter-interfaces@3.1.1

## 0.6.5

### Patch Changes

- Updated dependencies [429f88a]
  - @authhero/adapter-interfaces@3.1.0

## 0.6.4

### Patch Changes

- ac8a7a2: Fix `ReferenceManyField` hiding its `FilterForm` when a filter search returned zero results. The empty state now only renders when no filters are active, so users can keep refining their search instead of the form disappearing on them.

## 0.6.3

### Patch Changes

- Updated dependencies [3482bd3]
- Updated dependencies [8b8b117]
  - @authhero/adapter-interfaces@3.0.0

## 0.6.2

### Patch Changes

- Updated dependencies [d45a6b6]
  - @authhero/adapter-interfaces@2.13.1

## 0.6.1

### Patch Changes

- cea9675: Hide the React Email inbox-preview padding line from the email-template body editor by default. The Monaco `setHiddenAreas` API removes the noisy zero-width-character line from view without touching the underlying template. A "Hide invisible characters" toggle below the editor lets you reveal the line if needed, with a short explainer noting why those characters are there and shouldn't be removed. `CodeInput` now accepts an `editorOptions` prop and an `onEditorMount` callback for accessing the underlying Monaco editor.
- cea9675: Replace the email-template Delete button with a "Reset to default" button that only appears when a tenant override exists. The action calls the same `DELETE /api/v2/email-templates/{templateName}` endpoint, then refreshes the form so it falls back to the bundled default pre-fill. Clarifies the affordance — there is nothing to "delete" when no override exists yet.
- Updated dependencies [7a0606f]
  - @authhero/adapter-interfaces@2.13.0

## 0.6.0

### Minor Changes

- 64e5f01: Add `POST /api/v2/email-templates/{templateName}/try` endpoint and a "Send test" button in the admin UI. Renders the current (saved or in-progress) subject and body with sample data and dispatches via the tenant's email provider so customizations can be verified before saving.

  Pre-fill the admin email-template edit form with the bundled default subject and body when no tenant override exists, so users can see and edit the starting point directly instead of an empty form. The subject input also shows the bundled default as a placeholder when the field is cleared.

  Clearing the subject or body in the admin form now reverts to the bundled default on save instead of returning a 400. The PUT body's `from` field is now optional — at send time it falls back to the email provider's `default_from_address`. (Auth0 requires `from`; this is an authhero extension.)

  The admin preview now uses the current tenant's `friendly_name`/`support_url` and `branding.logo_url`/`colors.primary` so the rendered HTML matches what real recipients will see. The bundled default HTML is also emitted pretty-printed at build time so the editor pre-fill is human-readable instead of a single minified line.

  Add `DELETE /api/v2/email-templates/{templateName}` to remove a tenant's override and revert subsequent sends to the bundled default. (Auth0 has no DELETE; their pattern is `PATCH { enabled: false }` to disable. authhero keeps that toggle and adds DELETE as a clean "reset to default" affordance.) Requires `delete:email_templates`. Wired up to the admin's standard Delete button — clicking Delete on an override now reverts to the default instead of 404'ing.

  Add bundled defaults for the remaining six email template names so every template in the admin UI has a non-empty starting point: `blocked_account`, `stolen_credentials`, `enrollment_email`, `mfa_oob_code`, `change_password` (legacy), `password_reset` (legacy). authhero itself does not send these — they exist for Auth0-import compatibility and so tenants can pre-configure overrides.

  Documentation: new pages at `features/email-templates` and `auth0-comparison/email-templates` describing the lifecycle, available variables, server-side localization, the management API surface, and the deltas vs Auth0.

### Patch Changes

- Updated dependencies [64e5f01]
  - @authhero/adapter-interfaces@2.12.0

## 0.5.1

### Patch Changes

- Updated dependencies [b195d31]
- Updated dependencies [9149210]
  - @authhero/adapter-interfaces@2.11.0

## 0.5.0

### Minor Changes

- 4ff4f76: Add an Email Templates page under Branding, matching Auth0's dashboard structure. Lists all 12 supported templates (`verify_email`, `verify_email_by_code`, `reset_email`, `reset_email_by_code`, `welcome_email`, `user_invitation`, `blocked_account`, `stolen_credentials`, `enrollment_email`, `mfa_oob_code`, `change_password`, `password_reset`) with a Customized / Default / Disabled badge per row.

  The per-template editor exposes `enabled`, `from`, `subject`, and a Monaco-based HTML + Liquid body editor, with a live preview pane on the right that re-renders the Liquid template against sample tenant/branding/user variables as you type. Saving upserts the override via PUT `/api/v2/email-templates/{templateName}`; templates without an override remain on the bundled default until first save.

  Adds `liquidjs` as a runtime dependency for client-side preview rendering.

## 0.4.10

### Patch Changes

- 930f365: Expose `token_endpoint_auth_method` on the client Advanced tab so it can be viewed and changed after creation. Users can pick any of the standard OIDC values: `none`, `client_secret_basic`, `client_secret_post`, `client_secret_jwt`, `private_key_jwt`.

  Align the management API's `app_type`-derived default for confidential clients (`regular_web` and `non_interactive`) with Auth0: new clients of these types now default to `client_secret_post` instead of `client_secret_basic`. Public types (`spa`, `native`) continue to default to `none`. Explicit values from the caller still win — defaults only fill gaps. DCR (`/oidc/register`) is unaffected; it continues to default to `client_secret_basic` per RFC 7591.

## 0.4.9

### Patch Changes

- 3bef633: Admin UI: detect CIMD clients (via `client_metadata.cimd === "true"` marker set by the auth backend) and show a banner on the client edit page explaining that configuration is managed via the metadata document URL.
- 3bef633: Auth0-style typed clients: pick an app type up front, get the right defaults, see the right fields.

  **Backend (`authhero`)**
  - `POST /api/v2/clients` now derives `token_endpoint_auth_method` and `grant_types` from `app_type` when the caller doesn't supply them:
    - `spa`, `native` → `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code", "refresh_token"]`, no `client_secret` generated (PKCE-only).
    - `regular_web` → `token_endpoint_auth_method: "client_secret_basic"`, `grant_types: ["authorization_code", "refresh_token"]`, secret generated.
    - `non_interactive` → `token_endpoint_auth_method: "client_secret_basic"`, `grant_types: ["client_credentials"]`, secret generated.
    - Explicit caller values always win.
  - `PATCH /api/v2/clients/:id` rejects with 400 when the target is a CIMD-marked client (`client_metadata.cimd === "true"`) — those are managed via the metadata document.
  - `POST /api/v2/clients` rejects with 400 when `client_id` is a URL — CIMD clients are registered automatically on first `/authorize`.

  **Admin UI (`@authhero/admin`)**
  - Client create is now a two-step picker: choose app type (Regular Web / SPA / Native / Machine-to-Machine), then a small form scoped to that type. The selected `app_type` is sent with the create request so the backend defaults kick in.
  - Client edit hides the `client_secret` field for public types (SPA, Native) and CIMD clients; hides Callbacks / Logout URLs / Web Origins for Machine-to-Machine clients.

- Updated dependencies [3bef633]
  - @authhero/adapter-interfaces@2.10.0

## 0.4.8

### Patch Changes

- 8b8fe4d: **DCR default flipped to open registration to match Auth0.** The `dcr_require_initial_access_token` tenant flag previously defaulted to "require IAT" — turning on `enable_dynamic_client_registration` would advertise `/oidc/register` in discovery but reject every anonymous POST with 401. That contradicted Auth0's semantics, where enabling DCR means open registration.

  After this change, the default is open: enabling `enable_dynamic_client_registration` makes `/oidc/register` accept anonymous RFC 7591 calls (same as Auth0). Tenants that need the stricter behavior — typically self-hosted deployments without rate-limiting in front of the endpoint — must explicitly set `flags.dcr_require_initial_access_token = true`.

  The flag is now also exposed as a toggle in the admin UI's Feature Flags tab with helper text explaining the AuthHero-specific semantics.

  **Migration**: tenants that today rely on the implicit IAT requirement (flag unset, with DCR enabled) will start accepting anonymous registrations after upgrading. Set `flags.dcr_require_initial_access_token = true` on those tenants before deploying if you want to preserve the old behavior.

- Updated dependencies [1fb1bd1]
  - @authhero/adapter-interfaces@2.9.1

## 0.4.7

### Patch Changes

- Updated dependencies [8b9ef23]
  - @authhero/adapter-interfaces@2.9.0

## 0.4.6

### Patch Changes

- ed6e2bc: Register the `read:proxy_routes`, `create:proxy_routes`, `update:proxy_routes`, and `delete:proxy_routes` scopes on the management API resource server so they can be granted to roles and appear in access tokens (previously the proxy-routes endpoints were unreachable because the scopes were never defined). The admin role edit view now has Details, Permissions, and Raw JSON tabs, letting role permissions be managed from the UI.

## 0.4.5

### Patch Changes

- Updated dependencies [1b7a39b]
- Updated dependencies [1b7a39b]
  - @authhero/adapter-interfaces@2.8.0

## 0.4.4

### Patch Changes

- 28a6135: Add a Description filter to the logs list. The kysely Lucene filter helper now accepts a `likeFields` option so configured fields (currently `description` on logs) match with `LIKE %value%` instead of exact equality, making free-text searches against log descriptions actually useful.
- 154ba22: Show organization-scoped roles for each member in the organization members list. The `/api/v2/organizations/{id}/members` endpoint now populates each member's `roles`, `name`, and `picture` fields instead of always returning `roles: []`. The admin UI's organization Members tab gains a Roles column and a per-row edit dialog to assign/remove roles within that organization.
- Updated dependencies [28a6135]
  - @authhero/adapter-interfaces@2.7.0

## 0.4.3

### Patch Changes

- Updated dependencies [528e196]
  - @authhero/adapter-interfaces@2.6.1

## 0.4.2

### Patch Changes

- Updated dependencies [dcc6501]
  - @authhero/adapter-interfaces@2.6.0

## 0.4.1

### Patch Changes

- Updated dependencies [1bcf864]
  - @authhero/adapter-interfaces@2.5.0

## 0.4.0

### Minor Changes

- 354750f: Surface action executions on the log entry view. Logs that triggered post-login, credentials-exchange, or post-registration actions now show an Actions card linking to a new action-executions detail page (per-action status, duration, errors, and captured console output).

## 0.3.0

### Minor Changes

- 30233a7: Deliver audit events to tenant-configured HTTP log streams. The new `LogStreamDestination` is wired into the outbox pipeline (both inline and via `createDefaultDestinations`) and POSTs each event to every active HTTP log stream for the tenant. The sink shape mirrors Auth0's (`http_endpoint`, `http_authorization`, `http_content_type`, `http_content_format`, `http_custom_headers`), and `filters` are honored against `log_type`. Admin UI gains a Log Streams resource for managing HTTP sinks.

## 0.2.0

### Minor Changes

- a78ec60: Add "Try Connection" diagnostic flow (Auth0 parity). Adds `POST /api/v2/connections/{id}/try`: for database connections it runs the genuine password pipeline and returns the result inline; for any other strategy it returns an `/authorize` URL pinned to a per-tenant internal test client that drives the real upstream IdP round-trip without touching application config. Successful tests return both the normalized profile and the raw provider payload (added to the `oidc`, `oauth2`, and `google-oauth2` strategies via an opt-in `validateAuthorizationCodeAndGetUserWithRaw`) and never persist a real user. Results render on a new `/u2/try-connection-result` universal-login screen and are surfaced as a "Try" tab on the admin connection page.

### Patch Changes

- 302d93c: Log a `SUCCESS_HOOK` (`sh`) entry for each successful webhook invocation, mirroring the existing `FAILED_HOOK` log. Includes hook_id, trigger_id, URL, response status, and duration. Admin log filter now exposes both Success Hook and Failed Hook in the type dropdown.

## 0.1.2

### Patch Changes

- Updated dependencies [b6e628b]
  - @authhero/adapter-interfaces@2.4.0

## 0.1.1

### Patch Changes

- 9a57e8f: Polish Attack Protection page (tabs + cards per section, contextual helper text, collapse subsettings when disabled) and add a top-level MFA resource alongside it under the new Security sidebar group. The MFA page edits factor policy, individual factors, the SMS/Twilio provider, and the Guardian MFA hosted page in one place — previously these were buried as tabs inside Settings.

## 0.1.0

### Minor Changes

- b8213fb: Make `@authhero/admin` publishable and swap it in for `@authhero/react-admin` in the Docker image and `create-authhero` templates (local + cloudflare). The shadcn-based admin is now the default UI mounted at `/admin`. `@authhero/react-admin` remains in the workspace for now but is no longer wired into Docker or generated projects.
- 5e35511: Update for the new UI

### Patch Changes

- 5e35511: Add optional `options.configuration.realm` to connections. When set on an import-mode DB connection, it overrides the `realm` sent in the upstream password-realm grant (which previously always defaulted to the connection name). Exposed in the admin UI under the Import Mode credentials section.
- Updated dependencies [5e35511]
- Updated dependencies [5e35511]
  - @authhero/adapter-interfaces@2.2.0
