---
"authhero": patch
---

Security: enforce audience binding on the management API and stop minting tokens with arbitrary scopes for unregistered audiences.

Previously, any authenticated user could call `/authorize` with an `audience` value that did not match a registered resource server and request arbitrary scopes (e.g. `update:users`). The token endpoint passed those scopes through unchanged, and the management API middleware accepted the resulting token because it checked the `scope` claim without validating `aud`. This allowed a logged-in user to grant themselves management-API access.

Two changes close the gap:

- `calculateScopesAndPermissions` now rejects non-OIDC scopes when the requested audience does not match a registered resource server (`Service not found: <audience>`). OIDC default scopes (`openid`, `profile`, `email`, `address`, `phone`, `offline_access`) still pass through so plain login flows continue to work.
- The management API authentication middleware now requires the access token's `aud` claim to include the management API identifier (`urn:authhero:management`). Tokens issued for any other audience are rejected with 403.

Tokens minted through the normal `/authorize` or `/oauth/token` flow against the seeded management API resource server are unaffected.
