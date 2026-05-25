---
"authhero": patch
---

Stop enforcing the management API audience on the `/userinfo` endpoint. The audience check in `createAuthMiddleware` was previously always on, which 403'd normal user access tokens at `/userinfo`. The check is now opt-in via `createAuthMiddleware(app, { requireManagementAudience: true })` and only enabled by the management API.
