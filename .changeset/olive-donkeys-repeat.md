---
"authhero": patch
---

Scope the management API PATCH phone-number uniqueness check to `sms` users, matching the create path and Auth0.

The PATCH handler rejected a phone update if *any* user in the tenant held that number, regardless of provider — the same over-broad rule PR #1165 removed from the database, still live at the app layer. Non-sms users legitimately share phone numbers (placeholder and api-created values are common), so this produced spurious 409s on valid updates.

A phone number only identifies a user on the passwordless `sms` connection, so the check now applies only when the target user is an sms user, and only collides against other sms users. The lookup also moved to the provider-scoped `getUserByProvider` helper, which removes an unscoped `per_page: 10` query that silently missed matches past the tenth.
