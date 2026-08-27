---
"authhero": patch
"@authhero/adapter-interfaces": patch
---

Honour per-client refresh_token lifetimes instead of tenant session lifetimes (#1260). `token_lifetime` / `infinite_token_lifetime` now drive a refresh token's absolute expiry and `idle_token_lifetime` / `infinite_idle_token_lifetime` its sliding expiry — at mint, on rotation, and on the non-rotating slide — with `expiration_type: "non-expiring"` disabling expiry entirely. Unset config still falls back to the tenant's `session_lifetime` / `idle_session_lifetime`, so existing tenants see no change.
