---
"authhero": minor
---

Harden account-linking identifier semantics for merged users.

- **Email cascade (fixes the "changed my email, can't log in with my password" bug).** When the email of one email-identified identity in a linked cluster changes via the management API, the new address now propagates to the cluster's other email-identified identities (username-password / passwordless-email) so a linked password account isn't left logging in with the old address. sms (`phone_number`) and social (provider sub) identifiers are never rewritten. `email_verified` moves in lock-step so the cluster shares one verification state. New exported helpers `cascadeEmailToLinkedIdentities` and `isEmailIdentifiedUser`.
- **PATCH is now pass-through.** The user PATCH body schema stopped letting `userInsertSchema`'s create-time defaults leak through `.partial()`: omitting `email_verified` no longer silently flips it to `false` (which locked out `email_validation: "enforced"` clients after any edit), and omitting `app_metadata` / `user_metadata` no longer wipes them.
- **Opt-in profile promotion.** New `copyProfileFields` option on the `account-linking` template fills *absent* root profile fields on the primary from the secondary (e.g. a `birthdate` or phone the primary lacks) — fill-if-absent, never overwrite, and never an identifier or verification field. Off by default, matching Auth0 (a linked identity's own attributes otherwise stay under `identities[].profileData`).
