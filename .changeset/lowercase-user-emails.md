---
"authhero": patch
---

Fix mixed-case emails being stored on user accounts, and the duplicate accounts that followed.

The u2 forgot-password screen only trimmed the submitted address where the identifier, login, and signup screens also lowercase it. Because a reset request lazily creates a native database user when none is found, entering an existing address with different capitalization missed the account and created a second one carrying the mixed-case email — unreachable by every email lookup, since those all normalize their input.

Normalization is now enforced in three places:

- `addDataHooks` lowercases `email` on `users.create` and `users.update`, covering writes that skip the request-schema transform (SCIM provisioning, Auth0 lazy migration, IdP profiles). The registration and update decorators normalize again immediately before their commit, since a pre-registration or pre-update hook can assign `email` via `setUserMetadata` after that point.
- `getOrCreateUserByProvider` normalizes an `"@"`-bearing identifier before its lookup, so every lazy find-or-create flow (password reset, ticket exchange, refresh-token migration, passwordless, social callback) matches the existing account instead of duplicating it. Plain usernames and E.164 phone numbers are left untouched.
- The u2 forgot-password screen and `requestPasswordReset` lowercase the address, which also keeps `loginSession.authParams.username` normalized for the reset-code and resend screens.

## Existing rows are not migrated

This change is forward-looking only — no migration ships with it, and rows already stored with a mixed-case email keep it. Those rows stay unreachable by the normalized lookups, so they need a separate backfill, which cannot be a blind `UPDATE ... SET email = LOWER(email)`:

- **Detect collisions first.** Group by `LOWER(email)` per tenant and find groups with more than one row. Lowercasing a mixed-case row whose lowercase twin already exists will hit the unique-email constraint and fail the statement.
- **Reconcile the colliding pairs before converting.** Where both casings exist they are the same person with two accounts, so they need linking (`linked_to`, oldest row staying primary, matching the built-in linking rule) or merging of identities, credentials and metadata — not an overwrite that would silently drop one side.
- **Then lowercase the non-colliding remainder**, which is safe to convert in bulk.

Duplicates created by the forgot-password path are recognizable as native database rows (`auth0|*` / `auth2|*`) with no password set, since the reset was never completed.

Adapters differ in whether they ever produced these rows: MySQL/PlanetScale's default collation is case-insensitive, so the lookups matched and no duplicate was created, whereas SQLite/D1 compares case-sensitively.
