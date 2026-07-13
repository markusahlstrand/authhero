---
"@authhero/adapter-interfaces": major
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
"authhero": minor
---

Add `GET /roles/{id}/users` to the management API with Auth0-style checkpoint pagination

The endpoint returns the distinct users assigned to a role (per-organization assignments collapsed), as user summaries (`user_id`, `email`, `name`, `picture`). It supports the bare array, `include_totals` and checkpoint (`from`/`take` + opaque `next` cursor) response shapes, matching Auth0 — which requires checkpoint pagination on this endpoint past 1000 results.

Breaking (adapter-interfaces): `UserRolesAdapter` gains a required `listUsers(tenantId, roleId, params)` method, so custom adapter implementations must add it. It is implemented with keyset pagination in the kysely and drizzle adapters. The aws/DynamoDB adapter throws an explicit not-implemented error (its key layout has no index by role), mirroring the actions adapters.
