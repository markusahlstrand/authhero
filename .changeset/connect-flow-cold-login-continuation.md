---
"authhero": patch
---

Fix the DCR `/connect/start` consent flow for cold (no-session) users (issue #1006).

A user who entered the connect flow without an existing session was bounced to login, authenticated, and then dead-ended with `State not found` / `Redirect uri not found for this response mode.` instead of returning to consent — because the connect login session carries no `redirect_uri`/`response_type` and nothing resumed the connect screen after login.

Login completion now detects a connect login session (via `state_data.connect`) and, once the user is authenticated (and MFA satisfied), redirects back to `/u2/connect/start` with the auth cookie set instead of attempting a front-channel OAuth response. The social callback's `redirect_uri` guard is likewise relaxed for connect sessions. Covers both the passwordless (email OTP) and social login paths.
