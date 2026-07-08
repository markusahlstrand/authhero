---
"authhero": patch
---

Fix three pre-existing hook smells (issue #956):

- `post-user-login.ts`: `redirect.sendUserTo` now applies the login-session `state` parameter last, so a user-supplied `query.state` can no longer overwrite it.
- `post-user-login.ts`: `redirect.encodeToken` / `redirect.validateToken` now throw `"not implemented"` instead of returning placeholder output that action code could mistake for a real signed/validated token.
- `validate-signup.ts`: the `validate-registration-username` webhook `fetch` now has a 10s `AbortController` timeout (mirroring `WebhookDestination`), so a slow upstream can't block every identifier-page request.
