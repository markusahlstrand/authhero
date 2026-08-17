---
"authhero": patch
---

Scope the management PATCH user email-uniqueness check per connection

Changing a user's email 409'd whenever _any_ row in the tenant already carried
that address — including the user's own linked identities and identities on
connections where the email is not a login identifier. Patching a database user
to the email held by its linked `sms` identity was rejected as "Another user
with the same email address already exists."

The check now only rejects a row that would actually compete for the same login
identifier: same connection, and not part of the patched user's own linked
cluster. Same-provider rows still conflict regardless, since the
`(tenant_id, provider, email)` unique index cannot hold two of them. This
mirrors the existing `phone_number` carve-out on the same route and matches
Auth0, where one address may exist across connections.
