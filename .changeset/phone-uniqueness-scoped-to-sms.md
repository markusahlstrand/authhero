---
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
"authhero": patch
---

Stop enforcing phone-number uniqueness across every provider (#1162).

A phone number only *identifies* a user on the passwordless `sms` connection;
for every other provider it is ordinary profile data that people legitimately
share (placeholder / switchboard / family numbers). The blanket
`unique (phone_number, provider, tenant_id)` constraint therefore treated real,
distinct users as duplicates.

- `@authhero/kysely-adapter`: removed the `restore_unique_phone_provider`
  migration shipped in 11.21.0. Besides the wrong scope, its dedupe `DELETE`
  used a row-value `NOT IN` that exceeds PlanetScale's statement timeout (which
  is why production rolled it back and stayed intact). All environments have
  been cleaned of it, so it is deleted outright. The kysely baseline never
  carried a phone unique index.
- `@authhero/drizzle`: removed the `unique_phone_provider` index from the
  SQLite/D1 schema so tenant D1s no longer reject non-`sms` signups that reuse a
  phone. Migrations were consolidated into a single fresh `0000_init`. The
  non-unique `users_phone_tenant_provider_index` lookup index and the
  `unique_email_provider` / `unique_username_provider` indexes are unchanged.
- `authhero`: sms-phone uniqueness is now enforced at the application layer
  (Auth0-style, at lookup) on the management API user-create path, so creating a
  second `sms` user with an existing phone still returns 409 without relying on
  a database constraint.
