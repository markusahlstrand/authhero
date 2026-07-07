---
"authhero": patch
"@authhero/adapter-interfaces": patch
"@authhero/kysely-adapter": patch
---

Fix tenant log identity fields so logs match what Auth0 records

- SUCCESS_LOGIN logs no longer record the strategy (e.g. "okta") as the `connection`; the connection name actually used (e.g. "Okta-Warner") wins, resolved via the login session's `auth_connection`.
- `logMessage` now resolves `connection_id`, `client_name` and `user_name` from the data layer when the caller doesn't supply them, instead of hardcoding empty strings. Applies to every log/audit event, including the outbox path.
- Token endpoint success logs (`seacft`, `serft`, …) now carry `connection`, `strategy`, `strategy_type`, `user_name` and `client_name`.
- The password flow sets `ctx.var.connection` to the tenant's actual password connection name (resolved from the realm against the client's connections) instead of the user record's legacy provider literal (`auth0`/`auth2`) or the generic `Username-Password-Authentication` literal.
- Audit events gained optional `connection_id`/`client_name` fields, mapped through to stored logs.
- The kysely logs adapter returns the stored `client_name` instead of always returning `""`.
