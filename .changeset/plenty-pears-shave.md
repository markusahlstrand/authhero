---
"authhero": patch
---

Trim whitespace when normalizing emails, not just lowercase.

Email normalization called `.toLowerCase()` but never `.trim()`, so an address
with leading or trailing whitespace was stored verbatim and treated as a
distinct identifier from its trimmed twin — producing two accounts for the same
person on the same connection, with auto-linking silently skipping the pair
because it keyed on the un-trimmed value.

`withLowercasedEmail` is now `withNormalizedEmail` and applies `.trim()` before
`.toLowerCase()`, via a shared `normalizeEmail` helper that both the write path
and the lookup paths use. That covers `addDataHooks` (and with it SCIM
provisioning, Auth0 lazy migration, and IdP profile mapping), the pre-user
registration/update hook re-normalization, the `auth-api` request schemas
(`/passwordless/start`, `/co/authenticate`, `/dbconnections/signup` and
`/dbconnections/change_password`), the passwordless grant, password reset,
refresh-token migration, `/api/v2/tickets` lookups, SCIM `userName` resolution,
and the account-linking read paths (`link-users`, `link-candidates`,
`getOrCreateUserByProvider`, the linked-cluster email cascade) so already-stored
rows with stray whitespace become linkable instead of staying invisible.

Existing data still needs a repair pass: rows where `email <> TRIM(email)` in
`users` and `user_identities` must be merged into their trimmed twin, or
trimmed in place where no twin exists.
