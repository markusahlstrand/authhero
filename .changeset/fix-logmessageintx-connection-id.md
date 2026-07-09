---
"authhero": patch
---

Fix missing / stale `connection` and `connection_id` on refresh-token, logout, and password-reset audit logs.

- `logMessageInTx` built the audit event without resolving identity enrichment, so outbox logs written inside a transaction — notably the `srrt` "Revoked N refresh token(s)" event from `/v2/logout` — recorded the `connection` name but left `connection_id` empty. It now resolves enrichment the same way `logMessage` does.
- Refresh-token exchange logs (`sertft`) replayed the generic `Username-Password-Authentication` realm stored on pre-fix login sessions, which never matched a tenant connection and produced an empty `connection_id`. `getConnectionInfo` now resolves that generic realm to the tenant's single database connection (mirroring the password flow's heuristic), and the log enrichment surfaces that connection's real name (e.g. `password`) and id.
- Password-change logs (`scp`) from both password-reset routes logged empty `connection` and `connection_id` because the flow never sets the request-scoped connection. Both routes now pass the connection they already resolve to the log.
- User-targeted management-API operation logs (`sapi`, e.g. "Delete a User"/"Update a User"/identity link-unlink) recorded the admin actor in `user_id` instead of the affected user. The flat log's `user_id` now uses the operation's target user (already captured as the audit event's `target.id`) for user/identity targets, matching Auth0; non-user resource operations (client, connection, …) still record the actor. The log's `user_name` now resolves for that same target user, so the displayed name no longer diverges from `user_id` (and a target user's email is never attributed to the admin actor on the audit event).
