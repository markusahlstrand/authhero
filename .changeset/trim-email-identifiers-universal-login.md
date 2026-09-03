---
"authhero": patch
---

Trim whitespace around email identifiers in the remaining universal-login route schemas (`/u/login/identifier`, `/u/account/change-email`, `/u/account/change-email-verify`), so a padded address resolves to the same account as the clean one instead of bypassing the uniqueness check and creating a duplicate.
