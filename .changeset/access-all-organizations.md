---
"authhero": minor
---

Add the `access:all_organizations` Management API permission. A user holding it at global scope can get organization tokens for, and list, every organization without being a member, and without the `inherit_global_permissions_in_organizations` flag. Unlike `admin:organizations` it grants no tenant-admin rights on the multi-tenancy `/tenants` routes. All organization gates (login, silent auth, refresh token, token exchange) now share one access rule, so `admin:organizations` with the flag is also honoured on the `/authorize` and silent-auth paths.
