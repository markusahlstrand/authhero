---
"authhero": patch
"@authhero/drizzle": patch
"@authhero/multi-tenancy": patch
---

Make the global `admin:organizations` org-membership bypass consistent across grants and adapters, and close a related privilege-escalation on the Drizzle adapter (#1198).

- **Parity across all three org gates.** The refresh-token grant, token-exchange grant, and `calculateScopesAndPermissions` now share one `userHasGlobalOrgAdminPermission` helper. Previously the scopes-permissions gate only checked *role-derived* global permissions, so a user granted `admin:organizations` **directly** (not via a role) passed the refresh-token gate but was still rejected with 403 once an `audience` was present. All three now honor both directly-assigned and role-derived global permissions, matched against the Management API audience.
- **Drizzle `userRoles.list` scope fix (privilege escalation).** `list(..., "")` (global / tenant-level roles) guarded on truthiness, so the empty-string scope fell through to "all scopes" and returned the user's roles across *every* organization. Consumers that read global roles this way — the `admin:organizations` bypass and the `globalRoles` bucket in `calculateScopesAndPermissions` — would therefore apply an **org-scoped** user's role permissions at the tenant level, letting an admin of a single organization mint a token carrying those permissions globally (e.g. listing every organization without any global grant). Only affected Drizzle (SQLite/D1) deployments; Kysely already scoped correctly. `list(..., "")` now filters `organization_id = ""`, matching Kysely and the documented contract (`undefined` = all scopes, `""` = global only, `"<id>"` = that org).
- **Audience tightening in tenant provisioning.** `@authhero/multi-tenancy`'s global-admin check now requires `admin:organizations` to be granted on the Management API audience, so an identically named permission on an unrelated resource server can no longer masquerade as the global escape hatch.

Note: this repairs the code paths, but a user must still actually hold `admin:organizations` on a global role/permission (and the tenant must enable `inherit_global_permissions_in_organizations`) to bypass org membership. A "tenant-admin"-style global role that lacks that specific permission is still rejected by design.
