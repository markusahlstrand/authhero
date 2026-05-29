# @authhero/admin

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
