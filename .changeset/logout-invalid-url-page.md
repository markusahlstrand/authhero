---
"authhero": patch
---

Render a branded error page instead of a bare "Invalid redirect uri" text response when `/v2/logout` `returnTo` or `/oidc/logout` `post_logout_redirect_uri` isn't in the client's Allowed Logout URLs.
