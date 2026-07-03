---
"authhero": patch
---

Reject `response_mode=query` for token-bearing response types at /authorize with `unsupported_response_mode` instead of silently coercing the response into the fragment — Auth0 parity per OAuth 2.0 Multiple Response Type Encoding Practices. Pure `code` responses with `response_mode=query` are unaffected.
