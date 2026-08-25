---
"authhero": patch
---

fix(cross-origin auth): carry the scope from /authorize through the login_ticket flow

In the cross-origin authentication flow (`POST /co/authenticate` → `GET /authorize?login_ticket=…` → `POST /oauth/token`) the authorization parameters supplied to `/authorize` were used for that request only and never persisted to the login session. Since the code exchange reads `scope` and `audience` back off the login session, the scope was silently dropped: access tokens came back with an empty `scope` claim and `offline_access` never produced a refresh token.

`ticketAuth` now merges the `/authorize` authParams over those stored by `/co/authenticate` — `/authorize` wins for everything it specifies, matching Auth0, where the authorization request owns scope, audience, response_type, redirect_uri, nonce, state and PKCE — and persists the result before completing the login.

`/co/authenticate` also now stores the `scope` its schema has always accepted, as a fallback for callers that send it there. Auth0 does not accept a scope on that endpoint, so Auth0-shaped clients are unaffected.

The merge deliberately excludes `client_id` and `username`, which identify who the ticket was minted for and are both caller-controlled at `/authorize` (`username` comes from `login_hint`). Redeeming a ticket under a different `client_id` is now rejected with a 403.
