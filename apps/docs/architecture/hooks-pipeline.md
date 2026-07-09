---
title: Hooks & Outbox Pipeline
description: How hook execution is split into prepare/commit/publish phases, how the outbox delivers post-hooks durably, and how dead-letter recovery self-heals failed webhooks.
---

# Hooks & Outbox Pipeline

This document explains the design behind AuthHero's hook execution model. If you are debugging a post-registration webhook, adding a new destination, or wondering why linking is split between an internal transactional step and a user-facing template, start here.

The user-facing `features/hooks.md` guide lists the triggers and how to write hook code. This document goes one level deeper — **how** those hooks run, where transactions begin and end, and what guarantees the system gives you at each phase.

## The core principle

> Transactions contain only atomic DB writes and outbox event inserts. Nothing else.

Pre-registration webhooks, user-authored action code, and HTTP calls to customer webhook endpoints must never execute while a database transaction is held open. Holding a transaction across unbounded external I/O exhausts connection pools and trips hosted-DB transaction timeouts on PlanetScale, D1, and Cloudflare Hyperdrive.

Every write operation runs through three strict phases:

```text
   ┌─────────────┐    ┌────────────┐    ┌──────────────────┐
   │   Prepare   │───▶│   Commit   │───▶│      Publish     │
   └─────────────┘    └────────────┘    └──────────────────┘
   validate + hooks   atomic DB write   outbox relay
   (outside txn)      (tight txn)       (async, retried)
```

## Phase 1 — Prepare

Runs outside any transaction. Responsible for:

- Validating the request (connection exists, email shape, signup allowed, …)
- Firing **blocking** hooks that can deny or mutate the in-flight entity:
  - `validate-registration-username`
  - `pre-user-registration` (both `ctx.env.hooks.onExecutePreUserRegistration` and DB-backed code hooks)
  - `pre-user-update`
  - `pre-user-deletion`
- Invoking `preUserRegistrationWebhook` / `preUserDeletionWebhook` over HTTP

If a pre-hook throws an `HTTPException`, the operation aborts. User code can also call `api.access.deny(code, reason)` to reject the signup. No DB row has been created yet; nothing to roll back.

The prepare phase takes unbounded time by design — webhook servers and Cloudflare Dispatch workers can take hundreds of milliseconds to seconds. That is OK because no connection is held open.

## Phase 2 — Commit

The narrow transactional core. Opens one short transaction that contains:

- The entity writes (`users.rawCreate` + `passwords`, or `users.unlink` loops + `users.remove`, or `users.update` + email-linking resolve).
- Optional outbox event inserts so the write and the enqueue commit atomically.

What is NOT allowed inside this transaction:

- HTTP calls.
- User-authored code.
- Anything that awaits something other than the DB.

Implementation highlights:

- `hooks/link-users.ts::commitUserHook` opens its own `data.transaction(…)` and calls `trxData.users.rawCreate` rather than `create`. `rawCreate` is the sibling method on `UserDataAdapter` that bypasses the decorator layer so the commit path never re-enters `createUserHooks`.
- `hooks/user-update.ts::createUserUpdateHooks` wraps its `update` + email-match linking in a txn (lines ~85–130 of that file).
- `hooks/user-deletion.ts::createUserDeletionHooks` wraps unlink-secondaries + remove-primary in a txn so the user graph is never left half-demolished.

The management-api middleware no longer wraps the whole request in a transaction. Each write path owns its own atomicity so pre-hooks stay outside the commit.

## Phase 3 — Publish

Post-event fan-out. Produces:

- Audit log entries (e.g. `SUCCESS_SIGNUP`).
- Webhook deliveries for `post-user-registration`, `post-user-deletion`, `post-user-login`, `credentials-exchange`.
- (Future) code-hook invocations for the same triggers.

All of these flow through the outbox. The request handler calls:

- `logMessage(ctx, tenantId, {...})` for audit events — writes an `AuditEventInsert` to `outbox_events`.
- `enqueuePostHookEvent(ctx, tenantId, triggerId, user)` for hook dispatches — writes an `AuditEvent` with `event_type=hook.{triggerId}` to the same table. Falls back to inline invocation when the outbox is not configured so tenants without outbox still receive webhooks (no retry, but delivered).

After the request handler returns, the `outboxMiddleware` flushes the synchronously-pushed `outbox.create` promises and hands the resulting event IDs to `processOutboxEvents` via `waitUntil`.

## The outbox relay

`packages/authhero/src/helpers/outbox-relay.ts` runs a simple loop:

1. Claim events (`claimEvents`) with a short lease so concurrent workers don't double-deliver.
2. For each claimed event, iterate the destinations:
   - If `destination.accepts?.(event) === false`, skip.
   - Call `destination.transform(event)` then `destination.deliver(...)`.
   - On failure → `markRetry` with exponential backoff, stop the destination loop for this event.
3. If every destination for an event succeeded → `markProcessed`.
4. If `retry_count >= maxRetries` → `deadLetter(id, finalError)` — the event stays visible in `outbox_events` with `dead_lettered_at` set and `processed_at` set (so the relay skips it on future passes) but `final_error` recorded.

### Destination registry

Four destinations ship today:

| Destination | `accepts()` | `deliver()` |
|---|---|---|
| `LogsDestination` | `!event.event_type.startsWith("hook.")` | writes an `AuditEvent` to the `logs` table |
| `WebhookDestination` | `event.event_type.startsWith("hook.")` | POSTs to each enabled webhook whose `trigger_id` matches, with `Idempotency-Key: {event.id}` and a 10s `AbortController` timeout |
| `CodeHookDestination` | `event.event_type.startsWith("hook.")` | runs each enabled **code hook** whose `trigger_id` matches through the `codeExecutor`, persists an `action_executions` record, and throws if any hook failed so the event is retried. No-op when no executor is configured. Listed **after** `WebhookDestination` |
| `RegistrationFinalizerDestination` | `event.event_type === "hook.post-user-registration"` | sets `user.registration_completed_at` (listed **after** the delivery destinations so the flag only flips when webhook **and** code-hook delivery succeeded) |

`WebhookDestination` and `CodeHookDestination` both accept `hook.*` events, so a single `hook.post-user-registration` / `hook.post-user-deletion` event fans out to webhooks **and** code hooks. The fan-out is not independent per destination: the relay runs an event's destinations in order and stops the loop at the first failure (step 2 above), so a webhook failure short-circuits the code-hook destination on that pass. The whole event is retried later, re-running every destination — which is why each destination must be idempotent.

Destinations are constructed per request in `getDestinations(ctx)` so they can close over ctx-scoped dependencies — notably the service-token minter used for webhook `Authorization` headers.

### Adding a new destination

1. Implement `EventDestination` from `helpers/outbox-relay.ts`.
2. Return `true` from `accepts` only for the `event_type` values you handle — destinations must not cross-write.
3. Make `deliver` idempotent. The relay can retry after a partial success if the worker dies between `deliver` and `markProcessed`. Webhooks rely on `Idempotency-Key`; in-DB destinations should dedupe on a unique constraint (see `LogsDestination.deliver` which swallows `UNIQUE constraint failed` on the `logs.log_id` column).
4. Throw on failure — the relay will `markRetry` with exponential backoff automatically.
5. Register it in every `outboxMiddleware` call — `auth-api/index.ts`, `management-api/index.ts`, and both universal-login apps (`universal-login/index.ts`, `universal-login/u2-index.ts`) — and in `createDefaultDestinations` (the cron-drain safety net) so retries on the cron path aren't silently skipped.

## Dead-letter & replay

When an event exhausts `maxRetries` (default 5), the relay writes `dead_lettered_at` + `final_error` on the row and marks it processed so it stops consuming relay capacity. Two management endpoints expose the queue:

- `GET /api/v2/failed-events?page=0&per_page=50[&include_totals=true]` — list dead-lettered events for the authenticated tenant, newest first.
- `POST /api/v2/failed-events/:id/retry` — clear `dead_lettered_at`, `final_error`, `processed_at`, `retry_count`, `next_retry_at`, `error`. The next relay pass picks it up.

See the [Failed events admin reference](../customization/failed-events.md) for the request/response shapes.

## Self-healing post-user-registration

A single-shot event that dead-letters would silently lose customer-authored post-registration side effects. `postUserLoginHook` compensates:

```ts
if (!user.registration_completed_at) {
  enqueuePostHookEvent(ctx, tenantId, "post-user-registration", user);
}
```

On every successful login, if the registration event never reached `processed` (either because it's still in retry, dead-lettered, or the original worker died), we re-enqueue. Because webhook delivery uses `Idempotency-Key: {event.id}` and the finalizer destination only flips `registration_completed_at` when all destinations succeeded, the customer's action code is guaranteed to run eventually as long as the user comes back at least once.

Self-healing requires post-registration action code to be idempotent. AuthHero enforces this by contract — webhook `Idempotency-Key` headers are the formal guarantee and code-hook authors are advised to check `app_metadata` before taking non-idempotent actions.

## Account linking: template-driven, with a legacy built-in path

Linking is intentionally split into two paths that share the same matching rules but differ in how they're invoked.

1. **Customer-facing template (the canonical mechanism).** `hooks/pre-defined/account-linking.ts::accountLinking()` is a pre-defined function shipped with the library, dispatched from `templatehooks.ts::handleTemplateHook` when a tenant enables a `TemplateHook` row with `template_id: "account-linking"`. **It is not user-authored code** — there is no `CodeExecutor` invocation, no JavaScript blob in the database, and no secrets to manage. The runtime calls the registered function directly. The same idempotent body backs three triggers — `post-user-login`, `post-user-registration`, and `post-user-update` — so the template can fully cover signup, social-callback, and email-verification flows.

2. **Legacy built-in path.** `hooks/link-users.ts::commitUserHook` performs the transactional commit of a new user. When `userLinkingMode` resolves to `"builtin"` (the default), it also runs the email-based primary lookup inside the same transaction (atomic with `rawCreate`). When it resolves to `"off"`, the lookup is skipped and the commit only writes the row.

Path selection is decided by `helpers/user-linking.ts::builtInUserLinkingEnabled` per request, applying:

1. Per-client `user_linking_mode` (highest priority — overrides the service default for one application)
2. Service-level `userLinkingMode` from `init()` (`"builtin"` default)

The template is idempotent: it no-ops when `linked_to` is already set, when the email is unverified (by default — configurable), or when the user is already the primary. Running it on every trigger is safe, and layering it on top of the built-in path is also safe (the second invocation finds `linked_to` already set and exits).

Long-term destination: `userLinkingMode` defaults to `"off"` and the legacy email-lookup block in `commitUserHook` is removed; only the transactional `rawCreate` and race recovery remain. Tenants opt in via the template alone.

## File organization

```text
packages/authhero/src/hooks/
├── index.ts                    # re-exports only
├── addDataHooks.ts             # wraps users.{create,update,remove} with decorators
├── user-registration.ts        # createUserHooks — prepare + commit + publish
├── user-update.ts              # createUserUpdateHooks — pre-update + txn
├── user-deletion.ts            # createUserDeletionHooks — pre-delete + txn
├── validate-signup.ts          # validateSignupEmail + preUserSignupHook
├── post-user-login.ts          # postUserLoginHook + Auth0-compat event object
├── link-users.ts               # commitUserHook — transactional create + optional email auto-link
├── templatehooks.ts            # dispatch for pre-defined template hooks
├── codehooks.ts                # user-code execution (Cloudflare Dispatch)
├── formhooks.ts                # form-based post-login redirects
├── pagehooks.ts                # page-based post-login redirects
├── webhooks.ts                 # shared HTTP invoker + per-trigger fetchers
├── helpers/
│   └── token-api.ts            # `token.createServiceToken` surface for user code
└── pre-defined/
    ├── ensure-username.ts      # template: backfill username from profile
    ├── set-preferred-username.ts   # credentials-exchange template
    └── account-linking.ts      # template: idempotent email→primary linking
                                #   bound at post-user-login, post-user-registration,
                                #   and post-user-update
```

The sibling modules under `helpers/outbox-destinations/` own the publish phase:

```text
packages/authhero/src/helpers/outbox-destinations/
├── logs.ts                    # LogsDestination (rejects hook.* events)
├── webhooks.ts                # WebhookDestination (hook.* events → HTTP POST)
├── code-hooks.ts              # CodeHookDestination (hook.* events → codeExecutor)
└── registration-finalizer.ts  # flips registration_completed_at
```

## Code hooks: from inline to outbox-backed

Post-user-registration **code hooks** (tenant-authored actions bound by `code_id`) used to run inline inside `createUserHooks` — best-effort and at-most-once, so a throw was logged and dropped. Post-user-deletion code hooks are new here and have no inline predecessor; they were only ever delivered through the outbox. Both now run through `CodeHookDestination` from the `hook.*` event, sharing the relay's retry + dead-letter machinery ([#950](https://github.com/markusahlstrand/authhero/issues/950)).

The core executor was decoupled from the request `ctx`: `codehooks.ts::executeCodeHook({ codeExecutor, data, tenantId, hook, event, triggerId, api })` runs the code given explicit dependencies, and the inline `handleCodeHook(ctx, …)` is now a thin wrapper that resolves them from `ctx`. This works because the serialized event never carries `ctx` (it is stripped before reaching user code) and post-registration/deletion expose an empty `api` (there is no token to mutate), so no synthetic request needs to be reconstructed.

**This changes the delivery guarantee from at-most-once to at-least-once.** A retried event re-runs every code hook for the trigger, so the outbox event id is passed to user code as `event.idempotency_key` for dedupe. Authors of non-idempotent side effects should key on it (or check `app_metadata`) — the same contract already required for self-healing.

> Code hooks that mutate tokens (`post-user-login`, `credentials-exchange`) still run inline — they must observe/alter the live token in the request, so they cannot be deferred to the outbox.

## Further reading

- [Hooks feature guide](../features/hooks.md) — user-facing reference for each trigger.
- [Audit Events architecture](./audit-events.md) — how audit events flow into the logs table.
- [Outbox adapter](../customization/adapter-interfaces/outbox.md) — schema + adapter contract.
- [Failed events admin reference](../customization/failed-events.md) — dead-letter replay endpoints.
- [Account linking guide](../features/account-linking.md) — template usage and options.
