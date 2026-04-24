---
"@authhero/cloudflare-adapter": patch
---

Harden `CloudflareCache.get` against empty or malformed cache bodies. Cloudflare's Cache API can occasionally return a matched entry with an empty body (edge races, evictions mid-stream), which caused `response.json()` to throw `SyntaxError: Unexpected end of JSON input`. The adapter now reads the body as text, treats empty or unparseable bodies as a cache miss, and evicts the bad entry so the next read refills it.
