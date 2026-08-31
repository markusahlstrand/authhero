---
"@authhero/kysely-adapter": patch
---

Report the real pagination window from `actions.list` when `include_totals` is
false. It previously returned `start: 0, limit: 0, length: 0` regardless of the
requested page, so callers that paginate without totals could not tell where
the page started or that it held any rows at all. `start`/`limit` now describe
the requested window and `length` is the number of rows on the page, matching
the `include_totals` branch.
