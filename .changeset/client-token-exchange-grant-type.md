---
"@authhero/admin": minor
---

Add the RFC 8693 token-exchange grant (`urn:ietf:params:oauth:grant-type:token-exchange`) to the client Grant Types picker. The token endpoint enforces the client's `grant_types` allowlist, so an org-scoped token exchange was rejected with `unauthorized_client` unless the grant was added via `PATCH /api/v2/clients/{id}` by hand. Clients that already carry the grant now show it as enabled instead of silently omitting it. Companion to the Organizations tab — enabling org-scoped token exchange is now fully reachable from the dashboard.
