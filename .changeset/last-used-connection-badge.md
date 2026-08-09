---
"@authhero/adapter-interfaces": minor
"authhero": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
"@authhero/widget": minor
---

Add an opt-in "Last used" connection hint to the u2 universal-login identifier and login screens (#1138).

- New `show_last_used_connection` flag on `promptSettings` (default `false`). When enabled, a successful login writes a per-tenant `httpOnly` cookie holding only the connection name (~1 year, never on failed auth), and the identifier/login screens badge the matching social connection button.
- `provider_details` in the Forms schema gains `last_used` and a server-translated `last_used_label`.
- The widget renders the badge via a new `button-social-badge` (and `button-social-badge-<provider>`) shadow part, leaving the documented `button-social-subtitle` `::part()` behaviour untouched.
