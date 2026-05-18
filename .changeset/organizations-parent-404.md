---
"authhero": patch
---

Management API `/api/v2/organizations/{id}/...` subpaths now return `404 Not Found` (instead of `500 Internal Server Error`) when the organization in the path doesn't exist. Adds the missing parent-existence check on `DELETE /{id}/members`, on the three `/{id}/enabled_connections/{connection_id}` GET/PATCH/DELETE handlers, and on `GET`/`DELETE /{id}/invitations/{invitation_id}`.

Membership, invitation, and enabled-connection writes also now resolve the organization first and persist via `organization.id` (never the raw path segment), so when a caller addresses the organization by name (Auth0-compat name lookup), the stored rows stay consistent and remain findable by the canonical id.
