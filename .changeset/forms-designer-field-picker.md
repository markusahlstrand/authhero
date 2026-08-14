---
"@authhero/admin": patch
---

Fix the form designer's user-attribute picker to match where data is actually stored, and add an attribute picker to field default values.

- Birthdate and Gender are root-level OIDC claims on the user profile, but the router-condition field picker listed them under `user_metadata.*`. Rules built from those entries never matched users whose values were written by UPDATE_USER flow actions (which write root-level keys), so completed forms were shown again on every login. They now emit `{{context.user.birthdate}}` / `{{context.user.gender}}`, alongside a new `{{context.user.address.country}}` option. The trap entries `user_metadata.address` and `user_metadata.phone` (shadowing the root `address` and `phone_number` claims) were removed.
- Field components (text-like and date) now have a picker on the Default value input that inserts `{{context.user.…}}` templates, so prefilling fields from the user profile no longer requires hand-typing template syntax.
