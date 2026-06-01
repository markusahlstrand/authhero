---
"@authhero/proxy": minor
---

Add a `dispatch_namespace` terminal handler that routes requests to Cloudflare Workers for Platforms. Given a dispatch namespace binding name and a script name (which may include `{tenant_id}`, `{custom_domain_id}`, `{domain}`, or `{host}` placeholders), the handler resolves the script at request time and invokes `env[binding].get(scriptName).fetch(request)`. Optional `cpu_ms` and `subrequests` options are forwarded as dispatcher limits.

The compiled host app now exposes the resolved `tenant_id`, `custom_domain_id`, and `domain` via the Hono context, accessible from custom handlers through new `getProxyTenantId` / `getProxyCustomDomainId` / `getProxyDomain` helpers in `handlers/util.ts`. `compileHostApp()` gains an optional third argument; existing callers continue to work unchanged.
