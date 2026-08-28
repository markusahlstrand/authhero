---
"authhero": patch
"@authhero/multi-tenancy": patch
---

Escape all values interpolated into Lucene `q` filters with `escapeLuceneValue`. Follow-up to the tokenize-before-OR-split fix (#1264): the remaining raw interpolations (emails, usernames, user ids, client ids, linked_to lookups, entity names in the multi-tenancy sync hooks, and the SCIM/DCR lookups) now go through the shared escaping helper, so a value containing whitespace, quotes or ` OR ` can never widen a query into extra clauses.
