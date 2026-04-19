---
"authhero": patch
---

Fix: `hook.post-user-registration` (and other `hook.*`) outbox events enqueued from the universal-login apps (`/u/*` and `/u2/*`) were dead-lettering immediately with `No destination accepts event_type=hook.post-user-registration` — the two universal-login apps' `outboxMiddleware` was only wired with `LogsDestination`, which rejects `hook.*` events. Registration webhooks never fired for users created through the OTP / identifier screens.

The universal-login apps now register the same destination list as auth-api and management-api (`LogsDestination` + `WebhookDestination` + `RegistrationFinalizerDestination`), so `hook.*` events enqueued on these routes are delivered and `registration_completed_at` is flipped on success.
