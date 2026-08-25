---
"authhero": minor
---

Issue a refresh token from the passwordless OTP grant at `/oauth/token`.

`grant_type=http://auth0.com/oauth/grant-type/passwordless/otp` never returned a
`refresh_token`, even when `offline_access` was requested at
`/passwordless/start` — the scope survived onto the tokens, but nothing minted
the token itself. The grant now authenticates its login session (which
`/passwordless/start` leaves PENDING, unlike the code flow where `/authorize`
has already created a session) and mints a refresh token bound to that session
when the effective scope contains `offline_access`. Binding it to a session
matters: a session-less refresh token reads as a pre-migration row to the
refresh grant and cannot be reached by a session revoke.

The grant also accepts `scope` and `audience` on the token request now, as
Auth0's does. Both override whatever `/passwordless/start` stored, so a caller
that never set them at start can still ask for `offline_access` at exchange time.

The cross-origin path (`/co/authenticate` with
`credential_type=…/passwordless/otp`) is unchanged — it already minted refresh
tokens through the front-channel response.
