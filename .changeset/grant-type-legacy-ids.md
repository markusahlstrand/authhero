---
"authhero": patch
---

Accept the legacy `passwordless_otp` grant id in `client.grant_types`

The admin console stored the short id `passwordless_otp` while the token
endpoint's RFC 6749 §5.2 check compares against the full Auth0 URI
`http://auth0.com/oauth/grant-type/passwordless/otp`, so any client saved with
the "Passwordless OTP" box ticked rejected every OTP exchange with
`unauthorized_client`. The check now maps legacy short ids to their canonical
form before comparing, and the admin console saves (and migrates on re-save)
the full URI.
