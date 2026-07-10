---
"authhero": patch
---

Enrich failed `refresh_token` exchange logs (`fertft`) with the same identifying
fields the successful exchange records. When a refresh token is rejected because
it was revoked, expired, reused, or presented to the wrong client, the log now
carries `audience` and `scope` (from the token's resource server) plus
`connection`, `connection_id`, `strategy`, and `strategy_type` (from the login
session it was minted against), instead of leaving them blank. The extra
login-session read only happens on the error path.
