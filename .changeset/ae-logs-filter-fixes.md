---
"@authhero/cloudflare-adapter": patch
---

Improve Analytics Engine log filtering to match the kysely adapter:

- Unescape Lucene escape sequences in `field:value` clauses. Clients escape filter values per Lucene rules (a dash becomes `\-`), but the backslash leaked into the generated SQL comparison, so filtering by any value containing a `-` returned no rows.
- Support bare free-text search terms in `q`. A term without a `field:` prefix now matches `user_id` (exact) and `ip`/`description` (substring), instead of being ignored (which returned every log). Searching `description` lets a user's email match failed-login events recorded before any user record existed.
