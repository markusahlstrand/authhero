---
"authhero": patch
---

Fix mixed-case emails being stored on user accounts, and the duplicate accounts that followed.

The u2 forgot-password screen only trimmed the submitted address where the identifier, login, and signup screens also lowercase it. Because a reset request lazily creates a native database user when none is found, entering an existing address with different capitalization missed the account and created a second one carrying the mixed-case email — unreachable by every email lookup, since those all normalize their input.

Normalization is now enforced in three places:

- `addDataHooks` lowercases `email` on `users.create` and `users.update`, covering writes that skip the request-schema transform (SCIM provisioning, Auth0 lazy migration, IdP profiles).
- `getOrCreateUserByProvider` normalizes an `"@"`-bearing identifier before its lookup, so every lazy find-or-create flow (password reset, ticket exchange, refresh-token migration, passwordless, social callback) matches the existing account instead of duplicating it. Plain usernames and E.164 phone numbers are left untouched.
- The u2 forgot-password screen and `requestPasswordReset` lowercase the address, which also keeps `loginSession.authParams.username` normalized for the reset-code and resend screens.

Existing mixed-case rows are unaffected and need a separate backfill.
