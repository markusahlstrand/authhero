---
"@authhero/kysely-adapter": patch
---

`organizations.remove` now reports whether a row was actually deleted. It
returned `execute().length > 0`, which is `1` even when nothing matched, so
`DELETE /api/v2/organizations/{id}` answered `200` for an unknown
organization instead of Auth0's `404`.
