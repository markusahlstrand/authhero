---
"authhero": minor
"@authhero/admin": patch
---

Never create users with the legacy "auth2" provider — new username/password users are always stamped with "auth0".

- `resolveUsernamePasswordProvider` now defaults to `"auth0"` when no `usernamePasswordProvider` resolver is configured; return `"auth2"` from the resolver to pin a tenant on the legacy value during a staged cutover.
- The management API `POST /users` no longer derives the provider from a database connection's `strategy` field (which legacy tenants persist as the `"auth2"` literal) and no longer honors a caller-supplied `"auth2"` provider — database users always get the tenant's resolved username-password provider.
- The exported `USERNAME_PASSWORD_PROVIDER` constant changed from `"auth2"` to `"auth0"`; seeding and the `ensureUsername` pre-defined hook now create `auth0|*` accounts, while their lookups keep matching existing `auth2|*` rows so no duplicates are created.
- The admin UI user-create form treats connections whose strategy is stored as `"auth2"`/`"auth0"` as password connections and always submits `provider: "auth0"`.

Reads remain dual-provider: existing `auth2|*` users keep resolving and logging in.
