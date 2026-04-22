---
"authhero": patch
---

Fix regression where "no audience" errors were thrown when completing authentication. The authparams-refactor release removed the tenant-level audience fallback from token minting, but some loginSession creation paths (`/co/authenticate`, `/dbconnections`, passwordless error path) don't stamp audience upstream. Restore the `tenant.default_audience` fallback in `createAuthTokens` and `createRefreshToken`, and stamp `audience` at the remaining session creation sites.
