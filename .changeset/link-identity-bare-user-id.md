---
"@authhero/adapter-interfaces": patch
"@authhero/drizzle": patch
"authhero": patch
---

Fix account linking with Auth0's `{ provider, user_id }` body, and the bare-id
shape of `identities[].user_id`

`POST /api/v2/users/{id}/identities` accepts either `link_with` or
`{ provider, user_id }`. In the second form Auth0 takes the secondary's id
**without** its provider prefix — "for the identifier
`google-oauth2|108091299999329986433`, `provider` is `google-oauth2` and
`user_id` is `108091299999329986433`" — but the handler looked up `body.user_id`
verbatim, found no user and returned a 400, _"Linking an inexistent identity is
not allowed."_ This is the shape the Auth0 SDK (and therefore the admin UI's
"Link user" button) sends, so linking was broken there for every account. The
full `provider|id` is now rebuilt before the lookup; an id that already carries
its `provider|` prefix still resolves.

`parseUserId` and `userIdParse` split on the _first_ pipe rather than every
pipe. Enterprise identifiers embed pipes of their own — `samlp|okta|jane` is
provider `samlp` plus bare id `okta|jane` — so `identities[]` reported
`okta`, an id belonging to no user and impossible to unlink. Management-api user
creation with a provider-prefixed `user_id` was truncating the same way, storing
a different id than the caller asked for; it now strips only a leading
`provider|`.

The drizzle adapter reported the _full_ `provider|id` in `identities[].user_id`,
where Auth0 and the kysely adapter report the bare id. Besides the response
divergence, `unlink` takes the bare id and re-prefixes it, so the value drizzle
handed out round-tripped to `provider|provider|id` and unlinked nothing while
still returning 200 — the admin UI's "Unlink" button silently did nothing on
drizzle. It now reports the bare id.
