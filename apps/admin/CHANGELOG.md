# @authhero/admin

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
