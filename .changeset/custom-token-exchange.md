---
"authhero": minor
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": patch
"@authhero/cloudflare-adapter": patch
"@authhero/admin": minor
---

Add Auth0-compatible Custom Token Exchange. A client can now exchange a token signed by a trusted backend at `/oauth/token` (RFC 8693, with a customer-defined `subject_token_type`) for AuthHero tokens for one of your users.

- New `/api/v2/token-exchange-profiles` management API and `tokenExchangeProfiles` adapter (kysely and drizzle, with migrations). A profile either runs an action on the new `custom-token-exchange` trigger (`api.authentication.setUserById` / `setUserByConnection`, `api.access.deny` / `rejectInvalidSubjectToken`), or verifies a JWT declaratively against a JWKS with no code (AuthHero extension).
- New client field `token_exchange.allow_any_profile_of_type` opts a client in.
- Admin UI: Custom Token Exchange profiles page, application toggle, and the new action trigger.
