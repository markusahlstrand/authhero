---
"authhero": patch
---

Enforce the client's `grant_types` allowlist at `POST /oauth/token` before dispatching to the grant flow. Previously the check ran after the flow, so a rejected `unauthorized_client` request had already consumed the OTP or authorization code and, for the passwordless grant, created an orphaned session and refresh token. A disallowed grant now fails fast with no side effects.
