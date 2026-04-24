---
"@authhero/kysely-adapter": patch
---

Drop redundant tenant_id indexes flagged by PlanetScale (connections, invites, organizations, role_permissions, themes) and remove the unused `members` table. Each drop uses ifExists() so it is safe against already-cleaned environments.
