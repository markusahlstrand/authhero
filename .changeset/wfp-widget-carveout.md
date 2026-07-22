---
"@authhero/cloudflare-adapter": patch
---

Serve `/u/widget/*` from the control plane in `createWfpForwardMiddleware`
instead of dispatching it to the tenant worker. The u2 universal-login pages
load the widget bundle as an ES module to hydrate the form, but a per-tenant
WFP dispatch worker has no static-assets binding and no `widgetHandler`, so the
request 404'd and the u2 Continue / social buttons rendered inert on every WFP
tenant pinned to u2.

The middleware now carves out a configurable list of shared static-asset path
prefixes (`localPaths`, default `["/u/widget/"]`) that fall through to the
local control-plane app. Pass `localPaths: []` to opt out.
