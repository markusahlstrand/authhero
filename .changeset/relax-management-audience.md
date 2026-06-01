---
"authhero": minor
---

Add `relaxManagementAudience` flag on `init()` to downgrade the management API audience check from a hard 403 to a `console.warn`. Use during a client migration: tokens issued for any other audience are still accepted as long as they carry a matching scope, but every accepted token logs a warning with `sub`/`aud` so operators can identify the remaining offenders. Flip back off once warnings stop — the audience check is a defense-in-depth control against tokens minted with attacker-chosen scopes for an unregistered audience.
