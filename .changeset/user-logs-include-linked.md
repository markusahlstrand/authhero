---
"authhero": minor
"@authhero/react-admin": patch
---

Add `GET /api/v2/users/{user_id}/logs` endpoint that returns log rows for the user and all of its linked secondary identities. Calling it with a secondary user_id returns 404, matching the convention used by the user PATCH endpoint.

The react-admin user **Logs** tab now hits this endpoint, so it surfaces login activity from linked accounts (which the previous `q=user_id:…` query against `/logs` silently missed, since linked accounts are stored as separate user rows and each retains its own `user_id` on log entries).
