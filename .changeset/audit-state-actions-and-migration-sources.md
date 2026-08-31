---
"authhero": patch
---

Capture entity state on action, trigger-binding and migration-source audit
events, and stop tail-masking entity state.

The `/actions`, `/actions/triggers/{id}/bindings` and `/migration-sources`
management routes now record `before`/`after` state on the audit events they
emit, so the outbox carries the same detail the already-converted config
entities do. Action secret values are stripped (the names are kept) and a
migration source's credentials block is redacted.

Tail-masking (`code`, `refresh_token`, `subject_token`, `actor_token`) is now
applied to request bodies only, which is what it was documented to cover. It
was also being applied to entity state, where an action's `code` is its source
rather than an authorization code — that reduced every action audit event to a
row of asterisks.
