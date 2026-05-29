---
"authhero": patch
---

`createClientServiceToken` can now fall back to the control-plane tenant when an M2M client isn't registered in the request tenant. The control plane is resolved via the multi-tenancy config's `resolveControlPlane` resolver (when set) or the static `controlPlaneTenantId`, and the grants, signing key, and `tenant_id` claim all follow the tenant where the client lives. A tenant can opt out of inheritance by returning `undefined` from `resolveControlPlane`.

The fallback is gated behind an explicit `allowControlPlaneFallback` option (off by default), so it is only reachable from operator-deployed code (the built-in email/MFA senders and injected email/SMS service adapters). Hook code, Actions, and HTTP/end-user-driven paths cannot cross the tenant boundary into control-plane clients. Even opted-in callers remain bounded by the control-plane client's `client_grant` records.
