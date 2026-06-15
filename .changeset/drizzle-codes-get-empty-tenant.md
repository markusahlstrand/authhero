---
"@authhero/drizzle": patch
---

Allow codes.get to be called with an empty tenant_id, looking up by code alone — matching loginSessions.get. The /callback and /authorize/resume routes resolve the tenant from the state artifact and call codes.get before the tenant is known.
