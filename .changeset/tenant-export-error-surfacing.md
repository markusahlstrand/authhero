---
"authhero": patch
---

Fix tenant-data export silently returning a corrupt 10-byte gzip when the
export fails before producing any row. The handler now prefetches the first
line before committing the streamed response, so a pre-first-byte failure
returns a proper 500 instead of a 200 with a truncated gzip header. All export
failures (including mid-stream) are now logged as `FAILED_API_OPERATION` so the
underlying cause is diagnosable.
