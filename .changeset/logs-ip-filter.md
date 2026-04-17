---
"@authhero/react-admin": patch
"@authhero/cloudflare-adapter": patch
---

Fix and extend log filtering on the admin logs page.

- The `IP Address` filter on the logs list was sent as `?ip=<value>`, but the management API only accepts filters through the Lucene `q` parameter, so the filter was silently dropped. Non-`q` filter fields are now merged into `q` as `key:value` pairs (e.g. `q=ip:89.10.186.153`).
- Added `Type` and `Status` (success/failure) select filters to the logs list.
- The Cloudflare Analytics Engine adapter now understands the pseudo-filter `success:true|false` and translates it to a `blob3 LIKE 's%' | 'f%'` prefix match on the log type.
