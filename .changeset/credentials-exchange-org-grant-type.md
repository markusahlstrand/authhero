---
"authhero": patch
---

Expose `organization` and `grant_type` on the `onExecuteCredentialsExchange` hook event. Both values are already in scope at the call site, but `grant_type` was hardcoded to `""` and `organization` was never forwarded. This unblocks org-scoped custom claims (e.g. `azp`/`vendor_id` derived from the organization passed to a `client_credentials` exchange). The `display_name` field on `HookEvent.organization` is now optional — at most call sites only `{id, name}` is available, and existing hook consumers already had to handle the whole `organization` field being undefined.
