---
"@authhero/kysely-adapter": patch
"@authhero/admin": patch
---

Add a Description filter to the logs list. The kysely Lucene filter helper now accepts a `likeFields` option so configured fields (currently `description` on logs) match with `LIKE %value%` instead of exact equality, making free-text searches against log descriptions actually useful.
