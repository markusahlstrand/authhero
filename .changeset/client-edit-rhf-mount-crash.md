---
"@authhero/react-admin": patch
---

Fix `Cannot read properties of undefined (reading 'mount')` crash on the Clients edit page.

- Collapsed the dual-registered `client_metadata` path: `email_validation` and `disable_sign_ups` are now rendered inside `ClientMetadataInput` instead of as separate `SelectInput` / `BooleanInput` at `client_metadata.*`, so react-hook-form no longer sees the same path as both a leaf and a parent.
- Added a `normalizeClient` `queryOptions.select` on the Edit view that defaults `client_metadata`, `addons`, and `addons.samlp` to empty objects when the stored record omits them or returns a non-object, keeping nested inputs (`addons.samlp.*`) safe.
