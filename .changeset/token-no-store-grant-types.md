---
"@authhero/adapter-interfaces": patch
"authhero": patch
---

Add `Cache-Control: no-store` and `Pragma: no-cache` headers to the token endpoint response (per RFC 6749 §5.1) and advertise `grant_types_supported` in the OpenID Connect discovery document. Reject refresh-token exchanges where the refresh token's `client_id` does not match the authenticating client. Implement `POST /oauth/revoke` per RFC 7009 (refresh-token revocation, with `client_secret_basic` and `client_secret_post` client authentication).
