---
"authhero": patch
---

Forward `tenant: { id }` to the pre- and post-user-registration hook events, matching the update and deletion hooks. Consumers no longer need to fall back to `event.ctx.var.tenant_id`.
