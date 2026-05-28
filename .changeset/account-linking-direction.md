---
"authhero": patch
---

Fix account-linking direction so the older account always stays primary. When two users shared the same email and linking was triggered from the older user's side (e.g. its email was updated to match a newer duplicate, or the `account-linking` template hook ran for the older user at post-login/post-update), the older account was incorrectly demoted to a secondary of the newer one. The auto-link path in `users.update` and the `accountLinking` template hook now compare `created_at` and repoint the newer primary (and its existing secondaries) instead. `getPrimaryUserByEmail` also returns the oldest primary deterministically, so callers see a stable canonical account even when race-condition duplicates exist.
