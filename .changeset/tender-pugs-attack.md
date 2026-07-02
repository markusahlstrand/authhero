---
"authhero": patch
---

Tenant export: prefetch the first 1000 lines / 1 MB before committing the streaming response, so adapter failures anywhere in that window — in practice the entirety of small and medium tenants — surface as a real 500 with a tenant log entry, instead of a 200 with a truncated 10-byte gzip. Also make the stream-side success/failure logs reliable: they are now written with `waitForCompletion` (a `waitUntil`-scheduled write can be dropped once the stream ends) and a failed log write can no longer mask the original error.
