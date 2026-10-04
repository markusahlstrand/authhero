---
"authhero": patch
---

Align signup and email-verification logs with Auth0. Database signups through the u2 signup screen, the classic `/u/signup` page and invitation acceptance now log `ss` (Success Signup). A login that continues into the email verification step no longer logs a failed login (`f`), the `sv` log carries the connection and strategy, and the `svr` log for a verification code says so in its description.
