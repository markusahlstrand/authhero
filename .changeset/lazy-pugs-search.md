---
"@authhero/adapter-interfaces": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Make user search by full email address an indexed lookup

A bare `q` token on `GET /api/v2/users` was always turned into
`LIKE '%token%'` across email, name and phone_number. A leading wildcard is
unindexable, so searching for a user by email scanned every row in the tenant —
twice when `include_totals=true`. A token that is a complete email address now
resolves to an equality comparison against the email column alone, which the
`(email, provider, tenant_id)` unique index serves as a seek. Partial terms
("@example.com", "harald") keep the substring behaviour.

The totals count also runs alongside the page query instead of after it.
