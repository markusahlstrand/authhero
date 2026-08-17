---
"@authhero/aws-adapter": patch
---

Fix checkpoint pagination in the DynamoDB adapter returning empty pages.

`queryWithPagination` treated `from` as a numeric offset (`parseInt(from, 10)`). Since `from` became an opaque cursor, that parse yields `NaN`, so `targetCount` was `NaN`, the fetch loop's `totalFetched < targetCount` guard was false on the first check, and the query never ran — every checkpoint request silently returned zero items with no error. This affected every list going through the helper: clients, logs, organizations, client grants, tenants, flows, resource servers, role permissions and user permissions.

Checkpoint mode now uses DynamoDB's native keyset instead of an offset. `from` decodes to a `LastEvaluatedKey` that is passed as `ExclusiveStartKey`, so a page resumes exactly where the previous one stopped without reading and discarding skipped rows, and the adapter emits `next` (absent on the last page) like the kysely and drizzle adapters do. A malformed or foreign cursor decodes to `null` and restarts the walk rather than throwing on client-supplied input.

Offset pagination (`page`/`per_page`, plus `include_totals`) is unchanged, including the read-and-discard loop DynamoDB requires — the admin UI depends on it.

Note that DynamoDB returns `LastEvaluatedKey` whenever a query stopped early, including when it stopped exactly at the end of the data, so the final `next` of a walk can point at an empty page. The walk still terminates; avoiding it would cost a lookahead read per page.
