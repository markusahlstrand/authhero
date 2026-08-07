---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
---

Add an Auth0-parity `blocked` flag to users. A blocked user cannot authenticate or refresh tokens: the password login path rejects with `USER_BLOCKED`, the refresh_token grant returns `invalid_grant`, and `createAuthTokens` fails closed for every other grant. Blocking a user via the management API (`PATCH /api/v2/users/{id}` with `blocked: true`) also revokes the user's sessions and refresh tokens, mirroring Auth0's session termination on block. The field is stored on both the drizzle and kysely adapters (nullable column, additive migrations). This is the prerequisite for SCIM `active: false` deprovisioning (#1191).
