---
"authhero": patch
---

Front-channel logout (`/v2/logout` and `/oidc/logout`) no longer revokes refresh tokens. The auth session cookie is shared by every client on the tenant, so the previous cascade let a logout from one application kill other applications' refresh tokens — an unauthenticated GET destroying grants it never owned. Matching Auth0, logout now revokes the session only (back-channel logout notifications are still sent); clients revoke their own refresh tokens via the authenticated `POST /oauth/revoke` endpoint (RFC 7009).
