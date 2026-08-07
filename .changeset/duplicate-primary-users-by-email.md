---
"authhero": patch
---

Stop treating multiple primary users per email as an error on read paths. With `userLinkingMode: "off"` — Auth0's own default behaviour — a database account and a social account for the same address legitimately coexist unlinked, but every identifier POST logged "More than one primary user found for same email" and resolved the _oldest_ account.

- The login screens' signup gates (`login/identifier`, `login`, passwordless identifier, and `validateSignupEmail`) only ever needed to know whether an account exists for the address, so they now use the new `userExistsByEmail` helper instead of asking for a single canonical primary. This also removes a `"Primary account not found"` throw on a dangling `linked_to`.
- `getLoginStrategy` now resolves the last-used-strategy hint via the new `getLastUsedUserByEmail`, which picks the account with the most recent `last_login` rather than the oldest. Previously someone with an older social account and a newer password account was sent to the email-code screen even though they always sign in with a password. The selection is deliberately not provider-biased, so habitual social users are unaffected.
- `getPrimaryUserByEmail` now only logs the duplicate-primary error when the caller passes `warnOnMultiplePrimaries` — set on the built-in linking path, where duplicate primaries really do mean linking failed to converge.
