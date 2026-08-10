---
"authhero": patch
---

Allow overriding `azp` via `customClaims` on internal service-token mints again. 9.1.1 moved `createServiceToken` onto `createServiceTokenCore`, whose stricter reserved-claim list included `azp` — so hook code that mints attribution-carrying service tokens (e.g. an entitlements hook passing `customClaims: { azp: vendorId }`) started throwing `Cannot overwrite reserved claim 'azp'`, and the resulting tokens were silently issued without their entitlements claim. `azp` is attribution, not identity: `sub` stays locked to `auth-service`, and client-bound mints via `createClientServiceToken` still reserve `azp` to the registered client id.
