---
"@authhero/adapter-interfaces": patch
"@authhero/kysely-adapter": patch
"@authhero/cloudflare-adapter": patch
"@authhero/drizzle": patch
"authhero": patch
---

Add five new analytics metrics to the `/analytics/{resource}` API and the admin
Analytics dropdown: Logouts (`slo`, `flo`), Password Changes (`scp`, `fcp`,
`scpr`, `fcpr`), MFA (`gd_auth_succeed`, `gd_auth_failed`, `gd_auth_rejected`),
Email Verifications (`sv`, `fv`, `svr`, `fvr`) and Codes Sent (`cls`, `cs`).
Each is computed from the existing `logs` table — like the existing login/signup
metrics — and supports the same `time`, `connection`, `client_id`, `user_type`
and `event` group-by dimensions, so success/failure can be split via
`group_by=event`. Wired through the kysely, drizzle and Cloudflare Analytics
Engine adapters.
