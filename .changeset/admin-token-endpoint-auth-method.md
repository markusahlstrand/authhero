---
"@authhero/admin": patch
"authhero": patch
---

Expose `token_endpoint_auth_method` on the client Advanced tab so it can be viewed and changed after creation. Users can pick any of the standard OIDC values: `none`, `client_secret_basic`, `client_secret_post`, `client_secret_jwt`, `private_key_jwt`.

Align the management API's `app_type`-derived default for confidential clients (`regular_web` and `non_interactive`) with Auth0: new clients of these types now default to `client_secret_post` instead of `client_secret_basic`. Public types (`spa`, `native`) continue to default to `none`. Explicit values from the caller still win — defaults only fill gaps. DCR (`/oidc/register`) is unaffected; it continues to default to `client_secret_basic` per RFC 7591.
