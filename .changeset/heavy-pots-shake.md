---
"authhero": patch
---

Optimize /authorize/resume database usage

- Defer the last-login `users.update` (and its user-update decorator chain) off the response path via `waitUntil` — it was the slowest call in the login flow and nothing in the request reads its result.
- `createFrontChannelAuthResponse` now re-reads the login session once and threads that object through the MFA, consent, passkey-nudge and `completeLoginSession` steps instead of each doing its own fetch (5 reads → 2, 2 writes → 1).
- `/authorize/resume` stamps `(tenant_id, client_id)` on the context before fetching the enriched client, so tenant/client/connections reads are served from the client-bundle cache instead of per-entity round-trips.
- `getConnectionInfo` and the passkey-nudge check use the parameterless `connections.list` shape so the bundle covers them.
- RBAC permission reads (`userPermissions`/`userRoles`/per-role `rolePermissions`) now run in parallel instead of sequentially.
