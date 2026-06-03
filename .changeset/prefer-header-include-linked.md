---
"authhero": minor
---

Add RFC 7240 `Prefer` request header support on the management API. Callers can opt into relaxed-default behaviors per request and the server echoes which preferences were honored via `Preference-Applied`. First token: `Prefer: include-linked` on `GET /api/v2/users/{id}` returns a linked secondary user (instead of the default Auth0-compatible 404). Unknown tokens are silently ignored. The default response shape is unchanged, so existing Auth0 SDK callers are unaffected.
