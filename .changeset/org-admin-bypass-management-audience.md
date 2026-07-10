---
"authhero": patch
---

Fix organization token issuance for global admins. The `admin:organizations`
membership bypass now matches the permission against the Management API audience
(`urn:authhero:management`) instead of the requested token's audience. Previously
a user with a global `admin:organizations` role was rejected with `403 access_denied`
("User is not a member of the specified organization") whenever the requested token
targeted an app resource server (e.g. `urn:sesamy`), because the permission was only
recognised when it happened to be registered on that same app audience. Applies to
the refresh_token grant, the token-exchange grant, and the shared scope/permission
calculation used across token flows.
