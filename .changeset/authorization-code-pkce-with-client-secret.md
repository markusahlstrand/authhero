---
"authhero": patch
---

Allow `client_secret` and `code_verifier` in the same `grant_type=authorization_code` request, as required by OAuth 2.1 and recommended by RFC 7636 / RFC 9700 §2.1.1. The `/oauth/token` schema previously rejected the combination as a discriminated-union mismatch; both fields are now optional and validated independently — `client_secret` against the registered client, `code_verifier` against the stored `code_challenge`.
