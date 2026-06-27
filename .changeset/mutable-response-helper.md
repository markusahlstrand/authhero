---
"authhero": patch
---

Stop "Can't modify immutable headers." 500s when middleware annotates a received response.

A response returned from a `fetch()` / Workers-for-Platforms dispatch / Cache API / R2 carries an immutable header guard. Any middleware that writes a header after `next()` — CORS, Server-Timing, the `Preference-Applied` writer — threw `TypeError: Can't modify immutable headers.` (a 500) when handed such a response. This surfaced on the management API once WFP tenant requests began being dispatched to their own worker, but applied to any received response flowing through those middlewares.

Adds a shared `toMutableResponse(res)` / `ensureMutableResponse(c)` helper (exported from the package entry) that re-wraps a received response into one with mutable headers — cheap and deterministic, so it replaces the scattered try/catch re-wrap. The CORS, Server-Timing, and Prefer middlewares now normalize before writing, and a 101/WebSocket upgrade is left untouched.
