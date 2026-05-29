---
"authhero": patch
---

`event.connection` is now reliably populated in the `onExecuteCredentialsExchange` hook. Previously it was derived only from the request-scoped connection, so on token-exchange flows that don't carry it (authorization_code → token, refresh_token, `/authorize/resume`) the hook received `connection: undefined` even when the user's connection was known — causing consumers that branch on `event.connection?.name` to take the wrong path. The connection is now resolved from the login session's recorded `auth_connection` first, then the request connection, and finally the user's own connection as a last resort, matching Auth0's contract. The refresh_token grant additionally carries the original session's `auth_connection` through so linked users report the connection they actually authenticated with. Connection-resolution logic that was duplicated across the auth flows is consolidated into a single helper.
