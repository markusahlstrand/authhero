---
"authhero": patch
---

Fix the u2 password reset flow:

- Default to the "code" verification method when the password connection has no explicit `verification_method`, keeping the user on-page instead of relying on an emailed link.
- When the "link" method is used from the u2 routes, the reset email link now points at `/u2/reset-password` instead of the legacy `/u/reset-password`. The originating route prefix is threaded through `requestPasswordReset` → `sendResetPassword`.
