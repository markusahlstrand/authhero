---
"authhero": patch
---

Fix `/userinfo` leaking a generated default-avatar `picture` for users who have none when `picture` is requested via the OIDC `claims` parameter without the `profile` scope. The default-avatar fallback is now only attached on the `profile`-scoped claims path; individually requested `picture` claims reflect the user's real value.
