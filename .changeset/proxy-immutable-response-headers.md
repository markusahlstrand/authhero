---
"@authhero/proxy": patch
---

Fix `TypeError: Can't modify immutable headers` 500s in the data-plane router on Cloudflare Workers.

Response objects returned by `fetch()` on Workers (and Miniflare/`wrangler dev --local`) have immutable headers — calling `set`/`append`/`delete` on them throws. The response-phase handlers `rewrite_location`, `rewrite_cookies`, `headers`, `cors`, and `cache` all mutated `c.res.headers` in place, which crashed the worker on any upstream response that triggered them (e.g. a 3xx with a Location header through `rewrite_location`).

Tests passed because Hono's `app.request(...)` constructs Responses in-process where headers are mutable; only real Workers traffic hit the constraint.

Each handler now calls a new `ensureMutableResponseHeaders(c)` helper before mutating, which swaps `c.res` for a copy whose headers are a writable `new Headers(...)` (no-op when already mutable). Regression tests simulate the Workers constraint by freezing the fetch-returned Response's header mutators and exercising each handler end-to-end.
