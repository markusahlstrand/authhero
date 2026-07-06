# @authhero/admin

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
