---
"authhero": patch
---

Validate the trigger id on `PATCH /actions/triggers/{triggerId}/bindings` against the triggers a code hook can actually run on. A trigger outside that set (for example `post-user-update`) was previously cast through and persisted as a hook row that no dispatcher would ever pick up; it now returns a 400 instead.
