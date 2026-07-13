---
"@authhero/drizzle": patch
---

Apply the `q` filter to the totals count in the tenants adapter's list method. Previously `include_totals` returned the full table count even when `q` filtered the rows.
