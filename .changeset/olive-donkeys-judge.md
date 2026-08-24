---
"authhero": minor
---

Refresh grant reads auth-event data from the token, not the login session (#1258, stage 3 of #1255)

The grant now takes `session_id`, `organization`, `auth_connection` and
`auth_strategy` off the refresh-token row it has already loaded, and skips the
`login_sessions` read entirely when they are present. `session_id` is the
marker for "this row carries its own facts" — it is always set at mint for a
token issued under a session, so its absence means the row predates the
columns and the old login-session path is used unchanged.

This fixes a silent failure. `login_sessions` rows are short-lived and
routinely cleaned up, and until now the grant resolved all four fields through
them at exchange time — so an orphaned token quietly lost its session id,
organization and connection with no error, on both the success and the failure
-log paths. Tokens minted from stage 2 onward no longer can.

`session_id` is also now returned by
`GET /api/v2/users/{user_id}/refresh-tokens`, matching Auth0's field of the
same name.

**Behavioural note.** An org-scoped refresh token whose login session had aged
out previously kept working, minting tokens _without_ the organization claim.
It now resolves the organization it was minted for, so an exchange fails if
that organization was deleted or the user's membership was revoked. That is
the correct outcome — revoked membership should end org-scoped access rather
than silently downgrade it — but it is a visible change for that narrow case.
