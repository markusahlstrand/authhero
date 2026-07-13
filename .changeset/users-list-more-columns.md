---
"@authhero/admin": minor
---

Expose more user fields as toggleable columns in the users list. The table previously offered only email, phone number, connection, login count and last login; it now also defines user_id, name, username, given/family name, nickname, email verified, provider, locale, birthdate, address, last IP, created_at and updated_at. The new columns are hidden by default and can be enabled per user via the existing Columns button. birthdate and address are not sortable because the management API's user sort allowlist does not include them.
