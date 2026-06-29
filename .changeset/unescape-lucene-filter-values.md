---
"@authhero/kysely-adapter": patch
---

Fix log filtering crashes and missing matches on `q` queries:

- Values containing Lucene-reserved characters (e.g. a `-`) returned no rows. Clients escape filter values per Lucene rules (a dash becomes `\-`) and quote them, but `luceneFilter` stripped the quotes without reversing the escaping, so exact-match comparisons ran against a backslash-prefixed literal. Lucene escape sequences are now unescaped before the value is used.
- A free-text term containing a `:` (e.g. a timestamp like `2024-01-01T10:00:00`) or a clause referencing a non-column (e.g. `success`) was misparsed as a column reference and crashed the request with a SQL error. `logs.list` now sanitizes `q` against an allowlist of real columns (as `users`/`organizations` already do) before filtering.
- Free-text log search now also matches `description` (substring), so searching for a user's email finds failed-login events that happened before any user record existed.
