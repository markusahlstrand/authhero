---
"@authhero/adapter-interfaces": minor
"authhero": minor
"@authhero/admin": patch
---

Recognize every spelling of the database-connection strategy and write the Auth0-canonical value on new connections.

- `@authhero/adapter-interfaces` exports `DATABASE_CONNECTION_STRATEGY` (`"auth0"`, what Auth0 stores on database connections) and `isDatabaseConnectionStrategy()`, which matches the canonical `"auth0"` plus the two legacy spellings still present in existing data: `"Username-Password-Authentication"` (the connection name reused as strategy) and `"auth2"` (the legacy provider literal).
- All readers that detect a password connection — universal-login screens, password/ticket/dbconnections flows, callback error routing, and the admin UI — now use the tolerant matcher instead of comparing against the exact `"Username-Password-Authentication"` string. Tenants whose connection rows carry a legacy strategy value get correct password-login behavior everywhere.
- `seed()` now creates the database connection with `strategy: "auth0"` (name stays `"Username-Password-Authentication"`), matching Auth0's management API shape.

This is the prerequisite for backfilling existing connection rows to `strategy = "auth0"`: once this version is deployed, the backfill is a plain UPDATE and no reader depends on the old spellings.
