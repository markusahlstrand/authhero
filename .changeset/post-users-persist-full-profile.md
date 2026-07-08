---
"authhero": patch
"@authhero/kysely-adapter": patch
---

Persist the full user profile on `POST /users`. The management-api create handler previously hand-copied a whitelist of fields and silently dropped the rest (`given_name`, `family_name`, `nickname`, `picture`, `locale`, `gender`, `birthdate`, `zoneinfo`, `website`, `middle_name`, `preferred_username`, `app_metadata`, `user_metadata`, `address`, etc.) even though they are valid on the schema and the adapter already stores them — forcing a create-then-PATCH workaround. It now forwards all validated profile fields, matching Auth0 and the `PATCH /users` behaviour. Also fixes the kysely adapter's `create` to return `app_metadata`/`user_metadata` as objects (not serialized JSON strings) so the create response matches `get`/`list`.
