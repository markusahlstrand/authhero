---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
"@authhero/cloudflare-adapter": patch
"authhero": patch
---

Tokenize the Lucene `q` filter before splitting on OR, so quoting a value
contains it.

Both SQL adapters split `q` on ` OR ` before their quote-aware tokenizer ran,
so the quotes around a value only bracketed the first and last fragments and
anything between them was parsed as query syntax. A three-part value such as
`user_id:"attacker OR user_id:victim OR x"` produced a clean middle clause
that matched another user's rows within the tenant.

The tokenizer and the OR split now live in `@authhero/adapter-interfaces` and
run in the right order: a quoted value is a single token, and an escaped quote
(`\"`) no longer ends the quoted run. Clauses within an OR group are conjoined
(`a b OR c` is `(a AND b) OR c`) instead of being folded into one operand.
`sanitizeLuceneQuery` uses the same tokenizer, and the drizzle adapter now
unescapes value operands like the kysely adapter already did.

New exports: `escapeLuceneValue` (quote and escape a value for interpolation
into `q`), `unquoteLuceneValue`, `unescapeLuceneValue`, `tokenizeLuceneQuery`
and `splitLuceneOrGroups`. Server-side call sites that select rows by a
user-controlled id — the sessions, linked-account, owner-client, user-logs and
organization-membership lookups in the management API, the authentication
flows, invitation acceptance and the tenant-members backend — interpolate
through `escapeLuceneValue`, so an unquoted crafted value cannot widen those
matches either.

The adapters that pick a value out of `q` without running the full filter (the
kysely `user_organizations` and `clients` lists) unquote it, and the Cloudflare
Analytics Engine logs adapter shares the same tokenizer, so an escaped value
round-trips on every backend those call sites can reach.
