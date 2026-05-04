---
"authhero": minor
---

Implement OIDC RP-Initiated Logout 1.0 endpoint at `GET /oidc/logout`. Validates `id_token_hint` signature, enforces `client_id`/`aud` agreement, refuses unregistered `post_logout_redirect_uri`s, echoes `state` on the redirect, and atomically revokes the session + bound refresh tokens with `SUCCESS_LOGOUT` / `SUCCESS_REVOCATION` audit events. Renders a static signed-out page when no redirect URI is supplied.
