---
"authhero": patch
---

Post-login forms now operate on the primary user of a linked account cluster.

- Template hooks (account-linking) now run before the form/page hook dispatch in `postUserLoginHook`, so a login that triggers linking is linked before an interrupting form evaluates its router conditions. Previously an enabled form hook returned early and skipped account linking (and the remaining hooks) entirely on that login.
- When a form hook does not interrupt (its router falls through to the ending), the remaining post-login hooks now run instead of being skipped.
- The `/u` and `/u2` form node routes resolve the session user to its primary identity, so router conditions read the canonical profile and `UPDATE_USER` flow actions stamp submitted values on the primary — not on a linked secondary identity the session may point at.
