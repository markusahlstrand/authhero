---
"@authhero/proxy": minor
---

Add `createServiceBindingFetch` to route the HTTP proxy adapter's control-plane calls through a Cloudflare service binding instead of the public edge (#1079).

When a proxy-at-edge deployment fronts the same wildcard zone its control plane resolves on (e.g. the proxy owns `*.token.example.com/*` while `CONTROL_PLANE_URL` points at a host under that wildcard), resolving the control plane over the public edge loops the adapter's `/oauth/token` and `resolveHost` calls back into the proxy — a self-DoS. `createServiceBindingFetch(env.AUTH2)` wraps a service binding as the `fetch` override on `createHttpProxyAdapter`, so those calls reach the control-plane Worker directly and the loop cannot form regardless of `baseUrl`.

The `fetch` override already existed; this exports an ergonomic, documented helper for it and adds the proxy-at-edge cutover runbook to the deployment docs.
