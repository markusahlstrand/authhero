---
"@authhero/cloudflare-adapter": patch
---

Make the custom-domains adapter resilient to Cloudflare API failures. `get` and `update` now wrap the `/custom_hostnames/...` fetch and response parsing in try/catch and use `safeParse`, throwing `HTTPException(503)` with a diagnostic message instead of letting unparsed errors bubble as opaque 500s. The PATCH path also catches network errors on the actual update call.
