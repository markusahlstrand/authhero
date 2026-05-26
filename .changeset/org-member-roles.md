---
"authhero": patch
"@authhero/admin": patch
---

Show organization-scoped roles for each member in the organization members list. The `/api/v2/organizations/{id}/members` endpoint now populates each member's `roles`, `name`, and `picture` fields instead of always returning `roles: []`. The admin UI's organization Members tab gains a Roles column and a per-row edit dialog to assign/remove roles within that organization.
