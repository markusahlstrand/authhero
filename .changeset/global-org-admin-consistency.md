---
"authhero": patch
"@authhero/drizzle": patch
---

Make the global `admin:organizations` org-membership bypass consistent across grants and adapters (#1198).

- **Parity across all three org gates.** The refresh-token grant, token-exchange grant, and `calculateScopesAndPermissions` now share one `userHasGlobalOrgAdminPermission` helper. Previously the scopes-permissions gate only checked *role-derived* global permissions, so a user granted `admin:organizations` **directly** (not via a role) passed the refresh-token gate but was still rejected with 403 once an `audience` was present. All three now honor both directly-assigned and role-derived global permissions, matched against the Management API audience.
- **Drizzle `userRoles.list` scope fix.** `list(..., "")` (global / tenant-level roles) guarded on truthiness, so the empty-string scope fell through to "all scopes" and leaked org-scoped roles into global lookups. It now filters on `organization_id = ""`, matching the Kysely adapter and the documented contract (`undefined` = all scopes, `""` = global only, `"<id>"` = that org).

Note: this repairs the code paths, but a user must still actually hold `admin:organizations` on a global role/permission (and the tenant must enable `inherit_global_permissions_in_organizations`) to bypass org membership. A "tenant-admin"-style global role that lacks that specific permission is still rejected by design.
