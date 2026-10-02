---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
---

Operators can now permanently discard dead-lettered outbox events that will never succeed, either one at a time with `DELETE /api/v2/failed-events/{id}` or up to 100 at once with `POST /api/v2/failed-events/bulk-discard`. Both require the `update:logs` scope, are scoped to the caller's tenant, and only ever delete dead-lettered events. They rely on a new optional `discard(id, tenantId)` method on `OutboxAdapter`, implemented by the kysely and drizzle adapters; adapters without it answer 501.
