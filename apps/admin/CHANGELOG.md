# @authhero/admin

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
