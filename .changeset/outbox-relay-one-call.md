---
"authhero": minor
---

Add `runOutboxRelay` — a one-call helper for draining the outbox from a cron / scheduled handler. Internally it builds the same destination array the inline dispatcher uses, mints per-tenant `auth-service` tokens via the same in-process path (`createServiceTokenCore`), and then runs `drainOutbox` followed by `cleanupOutbox`. Consumers no longer need to plumb `getServiceToken` themselves to sweep up `hook.*` events on a schedule.

`createDefaultDestinations` now accepts an optional `webhookInvoker` of the same shape as the `init()` option. The inline per-request outbox dispatcher now honors `config.webhookInvoker` too, so cron-drained and per-request deliveries no longer diverge silently when a consumer supplies a custom invoker. All existing exports (`drainOutbox`, `cleanupOutbox`, `createDefaultDestinations`) keep their prior signatures; the new `webhookInvoker` field and `runOutboxRelay` export are additive.
