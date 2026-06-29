---
"authhero": patch
---

Clear the failed-login lockout counter when a user successfully resets their
password. Previously, a user who locked themselves out (3+ failed password
attempts within 5 minutes) and then reset their password would still be blocked
with `TOO_MANY_FAILED_LOGINS` when logging in with the new password, because the
`app_metadata.failed_logins` strikes were never cleared by the reset flow. Both
universal-login reset paths now wipe the counter on success, mirroring the
existing clear-on-successful-login behavior.
