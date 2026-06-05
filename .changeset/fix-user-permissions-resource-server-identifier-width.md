---
"@authhero/kysely-adapter": patch
---

Widen `user_permissions.resource_server_identifier` from `varchar(21)` back to `varchar(191)`. The 2025-09-11 migration that added `organization_id` accidentally narrowed the column, causing inserts of typical identifiers (URLs, URNs longer than 21 chars such as `urn:authhero:management`) to fail on MySQL/PlanetScale with "Data too long for column", which surfaced as a 500 from `POST /api/v2/users/:user_id/permissions`.
