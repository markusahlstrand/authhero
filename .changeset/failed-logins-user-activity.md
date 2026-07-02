---
"authhero": minor
---

Move failed-login lockout tracking from `app_metadata` to `user_activity` (phase 2 of #1003)

- Failed-password strikes are now stored as ISO 8601 timestamps in `user_activity.failed_logins` instead of numeric epochs in `users.app_metadata.failed_logins`, so a failed attempt no longer rewrites the users row. Third-party adapters without a `userActivity` implementation keep the legacy `app_metadata` behavior.
- The strike is now awaited before the 403 response is sent (previously fire-and-forget), so a terminated worker can't drop it.
- Pre-cutover strikes in `app_metadata` are not read anymore (entries expire after 5 minutes, so no backfill is needed); a successful login or password reset removes the leftover `app_metadata.failed_logins` key.
- Both reset-password flows now stamp `user_activity.last_password_reset` on a successful reset (previously nothing wrote it).
