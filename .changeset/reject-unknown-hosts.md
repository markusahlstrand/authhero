---
"authhero": minor
---

Add an opt-in `rejectUnknownHosts` option to `init()`. When it's on, `/.well-known/*` returns 404 for any host that isn't the ISSUER host, a subdomain of an existing tenant, or a registered custom domain. It's off by default, so existing deployments are unaffected.
