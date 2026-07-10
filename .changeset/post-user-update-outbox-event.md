---
"authhero": minor
---

Emit a `hook.post-user-update` outbox event when a user is updated (#1086).

Webhook and code-hook consumers previously received `post-user-registration` and `post-user-deletion` events but got no notification when a user was updated. `createUserUpdateHooks` now builds a `post-user-update` event and passes it into the `data.users.update(..., { outboxEvents })` call so it commits atomically with the update (using the `WriteOptions.outboxEvents` plumbing added in #1057), then relays it for durable delivery after the commit — falling back to inline webhook dispatch when the outbox isn't configured.

The event describes the row this update commits (`{ ...user, ...updates }`, reflecting any pre-update hook mutations to `updates`), consistent with the #1057 payload decision. The recursion-avoiding `linked_to`-only fast path and post-update template-hook side effects do not emit this event; account-linking can emit its own.
