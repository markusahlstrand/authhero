---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
---

Add SCIM 2.0 inbound-provisioning configuration plumbing (Phase 1 of #1191). Introduces three optional, tenant-scoped entities — `scimConfigurations` (one config per connection), `scimTokens` (hashed long-lived bearer tokens), and `scimExternalIds` (IdP `externalId` → `user_id` lookup) — with drizzle and kysely adapter implementations and migrations. Exposes the Auth0-parity management API under `/api/v2/connections/{id}/scim-configuration` (config CRUD, `default-mapping`, and token mint/list/delete), guarded by the existing `*:scim_config` / `*:scim_token` scopes and mounted only when the SCIM adapters are wired. Raw token secrets are returned once and stored only as SHA-256 hashes. The `/scim/v2` provisioning endpoints themselves land in Phase 2.
