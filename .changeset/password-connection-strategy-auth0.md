---
"@authhero/admin": patch
---

Fix the connection create form so the "Password" option sets the strategy to the canonical Auth0 database value `auth0` instead of the connection name `Username-Password-Authentication`.
