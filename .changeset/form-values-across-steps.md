---
"authhero": minor
---

Carry form field values across steps so a later `UPDATE_USER` can resolve them.

Each form submission only carried the components of the step being submitted, and `submittedFields` was rebuilt per request and never persisted. A multi-step form whose `UPDATE_USER` flow ran after a later step therefore resolved every earlier step's `{{$form.*}}` reference to `undefined`, and `resolveTemplateValues` dropped the key — with no error and no log, since the form path emits none. The result looked exactly like a form that silently refuses to write.

Submitted values are now accumulated on the login session's existing `state_data` (no migration) and merged into the set passed to `resolveNode`, so every answered field stays resolvable for the rest of the form. Later steps win on key collisions. The values are cleared with the rest of `state_data` by `completeLoginSessionHook`, so they never outlive the form, and `PASSWORD` / `CODE` fields and anything marked `sensitive` resolve for their own step but are never written to the session row.

Applies to all four submission handlers: the server-rendered `/u` and `/u2` form routes and the widget's flow and screen APIs.
