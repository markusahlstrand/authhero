---
"authhero": patch
---

fix: mint internal service tokens without running credentials-exchange hooks

`createServiceToken` previously minted through `createAuthTokens`, which runs the tenant's credentials-exchange hooks (the config hook plus DB template/code hooks). A tenant hook calling `api.access.deny()` therefore rejected every internal mint — e.g. the profile re-sync fired from a post-user-update hook — and a hook that updates a user could recurse straight back into itself.

Internal service tokens are now minted directly via `createServiceTokenCore` (which gained an optional `audience` override), keeping the same payload shape: `sub`/`azp` of `auth-service`, the tenant's audience with the `default_audience` → `{issuer}userinfo` fallback chain, and a custom-domain-aware issuer. Behavior changes: hook-added custom claims no longer appear on internal service tokens, `expiresInSeconds` is now honored in the JWT `exp` (default 3600s instead of the previous 86400s), and `customClaims` are validated against the core minter's stricter reserved-claim list (`scope`, `azp`, `tenant_id` included).
