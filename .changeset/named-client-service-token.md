---
"@authhero/adapter-interfaces": minor
"authhero": minor
---

Add in-process minting of grant-bounded service tokens for named M2M clients.

- `@authhero/adapter-interfaces`: `EmailServiceSendParams` and `SmsServiceSendParams` now accept an optional `createServiceToken({ clientId, scope, audience?, expiresInSeconds?, customClaims? })` callback. Custom service adapters can use it to obtain a Bearer token for a DB-registered client without a stored secret or round-trip to the token endpoint.
- `authhero`: new `createClientServiceToken` helper signs a `client_credentials`-shaped JWT locally, rejecting any audience or scope not covered by the client's existing `client_grant` records. The hook `api.token.createServiceToken` now accepts an optional `clientId` (and `audience`) to opt into the named-client path; without `clientId` the legacy `auth-service` minter is unchanged. The built-in email and SMS dispatch sites pass a tenant-bound minter into the adapter.
