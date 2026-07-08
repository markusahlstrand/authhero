---
"authhero": patch
---

Persist auth_strategy on the login session for flows that authenticate via createFrontChannelAuthResponse (password, passwordless OTP, passkey, ticket auth, silent SSO reuse). Previously only flows going through finalizeAuthenticatedSession (enterprise/social redirects) wrote auth_strategy, leaving auth_strategy_strategy/auth_strategy_strategy_type NULL for all password logins.
