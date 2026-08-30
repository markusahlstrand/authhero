---
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Release the outbox claim when replaying a dead-lettered event. `deadLetter` leaves `claimed_by` / `claim_expires_at` set from the relay pass that retired the event (unlike `markRetry`, which clears them), so replaying via `POST /api/v2/failed-events/{id}/retry` inside the 30-second lease window left the event invisible to `getUnprocessed` and the operator's retry appeared to do nothing.
