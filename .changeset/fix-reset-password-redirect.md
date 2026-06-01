---
"authhero": patch
---

Fix the post-password-reset redirect on the u2 universal-login flow. After a successful password reset, both `reset-password` and `reset-password/code` screens redirected to `/u2/identifier?...`, but the registered route is `/u2/login/identifier` — the catch-all screen dispatcher rejected `identifier` with a Zod validation error and the user was shown an error page instead of being returned to the identifier screen.
