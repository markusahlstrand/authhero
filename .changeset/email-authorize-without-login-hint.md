---
"authhero": patch
---

Support passwordless email login when `/authorize` specifies `connection=email` without `login_hint`. Prompt for an email address in both universal login versions and honor the email connection instead of password-first settings or the user's last-used password strategy.
