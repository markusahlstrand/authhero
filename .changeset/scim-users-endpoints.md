---
"authhero": minor
---

Add the SCIM 2.0 provisioning endpoints (Phase 2 of #1191). Enterprise IdPs (Okta, Microsoft Entra) can now provision users at `/scim/v2/connections/{connection_id}` using a connection-scoped SCIM bearer token: `GET/POST /Users`, `POST /Users/.search`, `GET/PUT/PATCH/DELETE /Users/{id}`, and the `ServiceProviderConfig`/`ResourceTypes`/`Schemas` discovery documents. Includes a hand-rolled SCIM filter parser (`eq`/`and`/`or`) and PATCH applier (covering the ops Okta/Entra send), `externalId` lookup via the scim_external_ids table, `active`↔`blocked` mapping (deactivation blocks the user and revokes their sessions), and `sscim` audit logging. Provisioning writes flow through the normal user pipeline, so hooks and the outbox fire as usual. Mounted only when the SCIM adapters are wired; `disable_signup` is bypassed for provisioning (an admin-plane write). Groups are not yet supported.
