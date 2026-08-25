---
"authhero": minor
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
---

Revoking or deleting a session now revokes the refresh tokens issued under it.

`DELETE /api/v2/sessions/{id}` and `POST /api/v2/sessions/{id}/revoke` used to
touch only the sessions row, and the refresh grant checks nothing but the
token's own `revoked_at` — so a revoked session's refresh tokens kept minting
access tokens until they expired on their own. Auth0 documents the opposite for
the same endpoint: *"Revokes a session by ID and all associated refresh
tokens."*

The same hole was live on the user-block path. `revokeUserSessions` resolved
tokens through `sessions.login_session_id`, which is written once at session
creation and never repointed on SSO reuse, so it records only the session's
*originating* authorization transaction. Every token minted during a later
re-authorization — a normal multi-client case — survived a block. Both paths now
share one cascade keyed on `refresh_tokens.session_id`, with the login-session
sweep retained alongside it for rows minted before that column existed. The
block path also runs the cascade for sessions that are already revoked, so
sessions revoked before this release do not keep live tokens.

Adapters gain `refreshTokens.revokeBySession(tenant_id, session_id,
revoked_at)`, implemented for kysely, drizzle and DynamoDB. Custom adapters must
add it.

**Revocation couples; lifetime does not.** A session *expiring* still does not
touch its refresh tokens, and cleanup still deletes each table on its own clock
— a refresh token is designed to outlive its session, and cascading on SSO
timeout would log out every long-lived native client. Only deliberate revocation
cascades.

This is a visible behavioural change: admins who revoke a session to end a
browser login will now also end that session's refresh tokens, which is the
intent.
