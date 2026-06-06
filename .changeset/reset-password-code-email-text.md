---
"authhero": patch
---

Fix the reset-password code email so it no longer reads "Click the button to reset your password" (there is no button — the email contains a code). The `reset_email_by_code` template now uses a new `reset_password_email_enter_code` string ("Enter the code below to reset your password"), translated across all bundled locales.
