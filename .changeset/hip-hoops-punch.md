---
"authhero": patch
---

Move failed-login lockout tracking to user_activity, and harden the password flow: activity-store failures now fail open instead of blocking logins or replacing the invalid-password response, and `last_password_reset` is recorded on the linked primary account.
