---
"@authhero/adapter-interfaces": patch
"authhero": patch
---

Validate usernames like Auth0 does, and stop emoji display names from 500ing

Creating a user with `username: "1Muse 😈"` returned a 500 and — worse — the
write had already committed, so the row was persisted and then threw again on
every subsequent read. `getAvatarInitials` built initials by indexing UTF-16
code units, so an astral character was split into a lone surrogate and the
`encodeURIComponent` call that builds the default `picture` URL threw
`URIError: URI malformed`. Initials are now taken by code point, and unpaired
surrogates are stripped defensively, so avatar generation cannot throw on
stored data. This is what made existing rows unreadable through the management
API, `/userinfo`, and ID Token issuance; those rows are now readable again
without a migration.

The crash was reachable through `name`, `nickname` and `given_name` — free-form
profile fields where Auth0 permits emoji — so it is fixed independently of the
username rules below.

`POST` and `PATCH /api/v2/users` now apply Auth0's database-connection username
rules and reject with a 400 instead of storing the value verbatim: alphanumerics
plus `_ + - . ! # $ ' ^ \` ~`, within the connection's configured length bounds
(defaulting to Auth0's 1–15), and lowercased on write so `MyUser`and`myuser`
are the same account. Validation applies only to database identities — a social
or enterprise identity's username is IdP data and passes through untouched — and
only at the API boundary, so bulk tenant import still accepts legacy usernames,
matching Auth0's own carve-out for imported users.

One deliberate divergence from Auth0: `@` stays rejected. Auth0 allows it, but
`getConnectionFromIdentifier` and `getUserByProvider` use the presence of an `@`
to tell an email identifier from a username, so permitting it would misroute
logins.

Universal-login signup still accepts a non-conforming username; that surface
needs translated error copy across all eight locales and is left for a follow-up.
