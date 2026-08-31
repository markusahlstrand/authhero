---
"authhero": minor
---

Route every custom-claim write path through one shared reserved-claim set (`helpers/reserved-claims.ts`).

Previously three divergent lists governed which claim names tenant-supplied code could set: the credentials-exchange hook API protected the seven JWT-spec names, `createServiceToken` protected nine, and `/userinfo` protected none at all. Claims the mint computes — `scope`, `permissions`, `tenant_id`, `sid`, `act`, `org_id`, `org_name`, `requested_userinfo_claims`, and on the ID token `nonce`, `at_hash`, `c_hash`, `s_hash` — were therefore writable from a hook on some paths, and `/userinfo` let a hook replace `sub`. All of them are now reserved on every path: both `setCustomClaim` closures in `createAuthTokens`, both in `/userinfo`, the `params.customClaims` merge, and both service-token mints.

Behaviour change: a colliding claim name is now **dropped with a warning in the tenant log stream** instead of throwing. The seven JWT-spec names previously failed the whole exchange; a hook that picks an unlucky claim name now degrades to "the claim isn't there". Non-colliding claims on the same call are unaffected, and tokens for requests that set no colliding claim keep their exact claim set.

Internal `auth-service` mints still allow `azp` to be overridden for downstream attribution; client-bound mints keep it locked to the registered client id.
