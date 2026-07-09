---
"authhero": minor
---

Deliver `post-user-registration` and `post-user-deletion` **code hooks** through the outbox instead of inline (issue #950).

A new `CodeHookDestination` runs tenant-authored code hooks for these triggers from the `hook.*` outbox event, alongside `WebhookDestination`. Code hooks now share the outbox's retry + dead-letter machinery instead of being best-effort inline — a failure is retried with backoff and surfaced via the failed-events endpoints rather than logged and dropped. `post-user-deletion` code hooks now run (they previously did not).

**Behavior change:** code-hook delivery for these triggers is now **at-least-once** rather than at-most-once. A retried event re-runs every code hook for the trigger, so the outbox event id is exposed to user code as `event.idempotency_key` for dedupe. The token-mutating triggers (`post-user-login`, `credentials-exchange`) still run inline and are unaffected.

The code executor was decoupled from the request context: a new `executeCodeHook(...)` core runs a code hook from explicit dependencies, and `handleCodeHook(ctx, …)` is now a thin wrapper over it. `createDefaultDestinations` / `runOutboxRelay` accept an optional `codeExecutor` so the cron-drain safety net also runs code hooks. `CodeHookDestination` is exported from the package root.
