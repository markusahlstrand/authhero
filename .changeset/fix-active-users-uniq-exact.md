---
"@authhero/cloudflare-adapter": patch
---

Fix 500 on `/api/v2/analytics/active-users` against Cloudflare Analytics Engine. AE SQL doesn't support `uniqExact`; switched to `COUNT(DISTINCT blob7)`.
