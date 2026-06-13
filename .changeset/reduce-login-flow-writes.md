---
"authhero": patch
---

Reduce blocking writes on the login hot path:

- **Single login-session write on authentication**: `authenticateLoginSession` now persists `auth_strategy` and `authenticated_at` in its state-transition update, and `finalizeAuthenticatedSession` no longer issues a second `loginSessions.update` for the same row. On the already-AUTHENTICATED replay path the (identical) strategy metadata is no longer re-written; `loginSession.authenticated_at` is audit metadata and is not used to reject resumed sessions.
- **Profile sync skips no-op writes and defers the rest**: `getOrCreateUserByProvider`'s `on_each_login` root-attribute sync now compares incoming values against the stored user and skips the `users.update` entirely when nothing changed (the common case). When something did change, the write is deferred past the response via `executionCtx.waitUntil` — the request itself uses the merged in-memory user. Without an ExecutionContext (Node, tests) the write stays synchronous.
