---
"authhero": patch
"@authhero/admin": patch
---

Accept the legacy `passwordless_otp` grant id in a client's `grant_types`. The admin console stored that short id while `POST /oauth/token` compares the wire value `http://auth0.com/oauth/grant-type/passwordless/otp`, so a client that ticked "Passwordless OTP" rejected every OTP exchange with `unauthorized_client`. The token endpoint now folds the legacy id into its wire form before the RFC 6749 §5.2 check, and the console saves the full URI while still rendering existing rows as checked — no data migration needed.
