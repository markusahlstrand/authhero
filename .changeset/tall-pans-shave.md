---
"authhero": minor
---

Add `runRetention()` — a single entry point that sweeps every prunable table (`codes`, `outbox_events`, and sessions/refresh_tokens/login_sessions where the adapter supports it).

Retention was previously per-table opt-in: each prunable table needed its own call that operators had to discover and remember, which is how `codes` grew unbounded in the first place. Scheduling `runRetention` now covers future prunable tables without any change to your handler.

Every sweep runs even if an earlier one throws, so one broken adapter method cannot stop the rest being pruned; failures surface as a `RetentionSweepError` carrying the partial result. The per-table helpers (`cleanupCodes`, `cleanupOutbox`) remain exported as escape hatches.

`runOutboxRelay` is unchanged — it still cleans up `outbox_events` after draining, and running both is safe.
