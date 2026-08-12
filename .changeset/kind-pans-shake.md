---
"@authhero/adapter-interfaces": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Make role permission assignment and removal idempotent so the management API stops returning 500 for no-op changes.

- `POST /api/v2/roles/{id}/permissions` returned 500 when re-assigning a permission the role already had. PlanetScale reports duplicate keys in the error message rather than as `ER_DUP_ENTRY` on `error.code`, so the kysely adapter rethrew the duplicate and the route surfaced it as "Failed to assign permissions to role".
- `DELETE /api/v2/roles/{id}/permissions` returned 500 when removing a permission the role did not have: both the kysely and drizzle adapters resolved `false` when no rows matched, and the route treats `false` as an adapter failure. They now resolve `true`, matching the AWS adapter, and the interface documents the contract.
- The drizzle adapter no longer deletes every permission on a role when `remove` is called with an empty array (`or()` over no predicates collapsed the where clause to tenant + role).
