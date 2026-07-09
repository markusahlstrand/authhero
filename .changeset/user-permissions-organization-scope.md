---
"authhero": patch
"@authhero/admin": patch
---

User permissions can now be scoped to an organization from the management API and admin UI. The `POST`/`DELETE` `/users/{user_id}/permissions` endpoints accept an optional `organization_id` per permission (previously ignored, which made organization-scoped permissions impossible to assign or remove). The admin user permissions tab shows an "Organization" column and lets you pick an organization when assigning permissions.
