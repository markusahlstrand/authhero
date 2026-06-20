---
"@authhero/drizzle": patch
---

Bring Drizzle adapter `q` filtering to parity with the Kysely adapter. `buildLuceneFilter` now supports a `likeFields` parameter (substring matching, e.g. log descriptions) and the OR branch honors it; a `sanitizeLuceneQuery` helper was added to whitelist fields and prevent tenant-boundary crossing via `q`. Filtering is now wired into the `organizations`, `resourceServers`, `codes`, `flows`, `forms`, and `keys` list operations (previously ignored `q`), and `users` (sanitize + whitelist), `logs` (description), `sessions`, and `refreshTokens` searchable columns were aligned with Kysely.
