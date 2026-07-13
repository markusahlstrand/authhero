---
"@authhero/cloudflare-adapter": patch
"@authhero/kysely-adapter": patch
---

Raise the hono peer dependency range from `^4.6.8` to `^4.12.30` so consumers resolve a hono version with the patched CORS middleware (reflected any Origin with credentials when origin defaulted to wildcard).
