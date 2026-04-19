---
"authhero": minor
---

Export `createDefaultDestinations` so consumers can call `drainOutbox` from a cron / scheduled handler with the same destination set the in-request middleware uses.

Previously the built-in `LogsDestination`, `WebhookDestination`, and `RegistrationFinalizerDestination` classes were private, so a consumer wanting to wire a cron-based outbox drain as a safety net would have had to reimplement all three to match the canonical hook.\* filtering, retry semantics, and post-registration finalization — and would drift any time authhero's internals changed. `createDefaultDestinations({ dataAdapter, getServiceToken })` returns the same array the per-request `outboxMiddleware` constructs, keeping the cron drain and the inline dispatcher in lock-step.

The destination classes themselves (`LogsDestination`, `WebhookDestination`, `RegistrationFinalizerDestination`) and the `EventDestination` interface are also exported now for consumers who want to customize the set.
