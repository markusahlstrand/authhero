---
"authhero": patch
---

Fix the `SUCCESS_LOGIN` log's `connection` field preferring the strategy label over the actual connection name. The resolution now prefers the authoritative `auth_connection` (recorded on the login session) before falling back to the `auth_strategy` label and finally the primary identity's `user.connection`, so the logged connection matches the one actually used to authenticate — consistent with `resolveConnectionName` and the hook event's `connection`.
