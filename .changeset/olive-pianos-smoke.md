---
"@authhero/proxy": patch
---

Guarantee client-IP forwarding for stored route chains.

`compileHostApp` now prepends a `forwarded_headers` handler to any route whose
handler list doesn't already declare one, and the data plane does the same for
the `defaultHandlers` catch-all chain. Route tables resolved from KV or the
control plane were routinely stored without it, which silently dropped the
visitor IP: nothing else in the chain stamps `X-Forwarded-For` / `X-Real-IP`, so
upstreams only saw the proxy hop's own source address. Chains that already
declare `forwarded_headers` anywhere in the list are untouched, so their
configured options still win and nothing is stamped twice. Injection is skipped
entirely when the handler registry doesn't know `forwarded_headers`, so
consumers running a bespoke registry are unaffected.

`forwardedHeadersHandler` also stops laundering Cloudflare's own address: when
the configured client-IP header (`CF-Connecting-IP` by default) holds an address
inside Cloudflare's published ranges — which is what a worker-to-worker hop
sees — it is treated as if the header were absent, preserving the real client IP
an earlier hop already recorded in `X-Forwarded-For`. An inbound `X-Real-IP` is
deliberately not used as a fallback since it is client-spoofable. Set
`skip_cloudflare_client_ip: false` on the handler to restore the old behavior.
