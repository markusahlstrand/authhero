---
"authhero": patch
---

Align the organization member-role management-api endpoints with Auth0.

Scopes now match Auth0's dedicated permissions: `GET /organizations/{id}/members/{user_id}/roles` requires `read:organization_member_roles` (was `read:organizations`), `POST` requires `create:organization_member_roles` (was `update:organizations`), and `DELETE` requires `delete:organization_member_roles` (was `update:organizations`). The new scopes are already in the seeded permission catalog.

`POST .../roles` is now idempotent and returns `204 No Content` (was `201` with a JSON body). Roles the member already has are skipped before insert, so retries and "ensure these N roles" batch calls no longer 500 on the underlying unique-constraint collision.
