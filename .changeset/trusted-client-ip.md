---
"authhero": patch
---

Derive the client IP from headers a caller cannot forge. `clientInfoMiddleware` read the first `X-Forwarded-For` entry whenever `X-Forwarded-Host` was set, but `@authhero/proxy` preserves the inbound chain and only appends the hop it verified — so anything to the left of that hop is the caller's own claim. `ctx.var.ip` keys the pre-login rate limiter (and its allowlist) and the passwordless IP check, both of which a scanner could sidestep by sending its own header. The IP now comes from `CF-Connecting-IP` (unless it holds one of Cloudflare's own addresses, as it does on a worker-to-worker hop), then `X-Real-IP`, then the last `X-Forwarded-For` entry. Refresh-token device records read the same derived value instead of the raw header.
