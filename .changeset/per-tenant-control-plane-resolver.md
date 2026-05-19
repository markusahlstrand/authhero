---
"@authhero/multi-tenancy": minor
---

Add a `resolveControlPlane` option to `initMultiTenant` and `withRuntimeFallback` for per-tenant runtime inheritance. The resolver receives `{ tenant_id }` and returns the control plane (`{ tenantId, clientId? }`) to inherit from, or `undefined` to opt that tenant out of inheritance entirely. Mirrors the shape of `signingKeyMode` / `userLinkingMode` in authhero so isolated tenants can be excluded from connection, hook, resource-server, and email-provider fallback without forking the adapter setup.

Access control, sync direction, and tenant management routing continue to use the static `controlPlane.tenantId` and are not affected by the resolver. Existing static `controlPlaneTenantId` / `controlPlaneClientId` usage is unchanged.
