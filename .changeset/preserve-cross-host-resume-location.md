---
"@authhero/adapter-interfaces": minor
"authhero": patch
"@authhero/proxy": patch
---

Fix an infinite redirect loop on `/authorize/resume` when a vanity/custom
domain is fronted by `@authhero/proxy` with `rewrite_location` composed into
the route chain for control-plane upstreams.

The control plane deliberately 302s `/authorize/resume` to the host that
served the original `/authorize` request so the session cookie lands on the
right domain. `rewrite_location` saw that Location's origin match the route's
upstream origin and rewrote it back onto the vanity host, where the host
check failed again — the browser bounced on `/authorize/resume` forever.

Those deliberate cross-host redirects (in `finalizeAuthenticatedSession` and
`resumeLoginSession`) are now stamped with an
`x-authhero-preserve-location: 1` response header, and `rewrite_location`
leaves a marked Location untouched, stripping the marker before the response
reaches the browser. Same-host/relative redirects are unmarked and rewrite
exactly as before. The header name is exported from
`@authhero/adapter-interfaces` as `PRESERVE_LOCATION_HEADER`.
