---
"authhero": patch
---

Resolve the tenant from the login session's client on the `/callback` error path. `/callback` is state-keyed, so on a host that doesn't identify the tenant `tenant_id` was still unset when a provider returned an error (e.g. `access_denied` after the user cancels), and the `FAILED_LOGIN` audit event was written without one. With the outbox enabled, the insert failed on `outbox_events.tenant_id NOT NULL` and the event was dropped ("Outbox event creation failed"). Fixes #1393.
