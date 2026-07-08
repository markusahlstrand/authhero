---
"authhero": patch
---

Persist auth_strategy on login sessions everywhere it was being dropped:

- createFrontChannelAuthResponse now passes authStrategy through to authenticateLoginSession, so password, passwordless OTP, passkey, ticket auth and SSO-reuse logins record auth_strategy (previously only enterprise/social flows via finalizeAuthenticatedSession did, leaving auth_strategy NULL for all password logins).
- silentAuth now copies auth_strategy from the originating login session onto the login session it creates (and re-points the session at), so the strategy survives silent token renewals instead of being severed on the first prompt=none call.
- silentAuth keeps the re-pointed login session alive for the session's full remaining lifetime (falling back to the session's absolute expiry when the tenant has no idle_session_lifetime), so cleanup can't reap it while strategy/connection recovery still needs it.
