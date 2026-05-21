---
"authhero": minor
"@authhero/multi-tenancy": minor
---

Remove the `auth:read` / `auth:write` super-scopes. Every management-api route now requires its specific Auth0-style scope (e.g. `read:users`, `create:clients`, `update:connections`). Tokens that previously relied on `auth:read` or `auth:write` must be reissued with the granular scopes for each endpoint they call.
