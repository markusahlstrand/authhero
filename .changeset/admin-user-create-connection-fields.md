---
"@authhero/admin": patch
---

Only show relevant fields in the user create form based on the selected connection: password (and username when the connection requires it) for database connections, email for passwordless email, and phone number for passwordless SMS. The connection dropdown now only lists database and passwordless connections, and extra profile fields (name, birthdate, picture, etc.) moved out of the create form — they remain editable on the user detail view.
