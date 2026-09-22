---
"authhero": patch
---

Roll back `PATCH /api/v2/actions/triggers/{triggerId}/bindings` when the swap fails partway: hooks created so far are removed and the removed bindings are re-created with their original ids and fields, so a storage failure no longer leaves the trigger partially unbound.
