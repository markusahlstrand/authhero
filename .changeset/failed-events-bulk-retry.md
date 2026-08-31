---
"authhero": minor
---

Add `POST /api/v2/failed-events/bulk-retry` to the management API. It replays up to 100 dead-lettered outbox events in one call, scoped to the caller's tenant like the single-event retry, and reports `{ replayed, not_found }` per id so one unknown id does not sink the rest of the batch.
