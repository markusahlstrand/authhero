---
"authhero": patch
---

Fix /authorize failing with "Strategy auth0 not found" when a client's only connection is a database connection stored with the canonical `auth0` strategy. The single-connection provider-redirect shortcut, the login-strategy resolution, and the identifier screens now all match database connections via `isDatabaseConnectionStrategy` (accepting the `auth0`, `auth2`, and `Username-Password-Authentication` spellings) instead of comparing against `Username-Password-Authentication` only. This broke the OIDC conformance suite after the seed switched to `strategy: "auth0"`.
