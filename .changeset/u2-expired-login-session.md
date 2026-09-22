---
"authhero": patch
---

Redirect page loads with an expired or unknown login session to the tenant's `default_redirection_uri` when one is configured (Auth0 behaviour), and stop logging expected 4xx errors from u2 screen initialization at error level.
