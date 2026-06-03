---
"authhero": patch
---

Align the organization member-role management-api endpoints with Auth0's scopes. `GET /organizations/{id}/members/{user_id}/roles` now requires `read:organization_member_roles` (was `read:organizations`), `POST` requires `create:organization_member_roles` (was `update:organizations`), and `DELETE` requires `delete:organization_member_roles` (was `update:organizations`). Tokens issued for these endpoints will need the dedicated scopes — they're already in the seeded permission catalog.
