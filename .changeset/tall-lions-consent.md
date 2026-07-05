---
"@authhero/drizzle": minor
---

Add the grants adapter (per-user OAuth consent storage), mirroring the kysely implementation. Without it the universal-login consent screen fails closed with access_denied — surfaced by the OIDC conformance suite's oidcc-refresh-token module after the conformance auth-server switched to the drizzle adapter. Ships migration 0001 creating the grants table.
