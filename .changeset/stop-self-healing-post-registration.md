---
"authhero": minor
---

Fix duplicate `post-user-registration` outbox events on a user's first login.

`postUserLoginHook` previously re-enqueued a `post-user-registration` event on every successful login whose `registration_completed_at` was still null, as a "self-healing" recovery for dead-lettered events. The check couldn't distinguish "event is still pending in the outbox" from "event was lost" — so every first-time login produced a second duplicate event while the original was still waiting to drain. In tenants with a pre-user-registration hook that mutates the user (e.g. setting `app_metadata.strategy`), the two enqueues even captured different user payloads, confirming the same bug.

Self-healing is removed from the login path. Delivery reliability for `post-user-registration` now belongs solely to the outbox (retry + dead-letter). Recovery of dead-lettered events is an explicit admin/cron responsibility and should no longer be tangled into the login path.

Also fixes the race-loser branch in `linkUsersHook`: `instanceof HTTPException` silently fails when the adapter is bundled (class identity differs across module boundaries), so the existing race-catch never actually fired in production. Switched to a duck-typed `status === 409` check and surfaced the race-loser as a 409 from `createUserHooks`, which `getOrCreateUserByProvider` now catches and recovers so the losing login still completes without re-firing post-registration hooks.
