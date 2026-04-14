---
title: Roadmap
description: Known loose ends from the hooks/outbox refactor and the direction we're heading.
---

# Roadmap

Living document tracking follow-up work after the durable-post-hooks refactor (April 2026). The main architecture is documented in [Hooks & Outbox Pipeline](./architecture/hooks-pipeline.md); this page enumerates what is intentionally unfinished and why, so the next contributor knows where to pick up.

## Status legend

| Symbol | Meaning |
| ------ | --------------------------------------------------- |
| ✅     | Done & shipped                                      |
| 🟡     | Partially done; next-step described below           |
| 🔲     | Not started; context captured so work can resume    |

## Completed

- ✅ Three-phase execution model (prepare / commit / publish) for user CRUD.
- ✅ Removed the management-api global-transaction middleware; pre-hooks no longer run inside a held DB transaction.
- ✅ `users.rawCreate` on the adapter interface + kysely / drizzle / aws implementations.
- ✅ Outbox-based post-hook delivery (`WebhookDestination`) with `Idempotency-Key` headers and 10s `AbortController` timeouts.
- ✅ Per-event destination filtering (`EventDestination.accepts`); `LogsDestination` now ignores `hook.*` events.
- ✅ Dead-letter handling in the outbox relay + `outbox_dead_letter` columns.
- ✅ `GET /api/v2/failed-events` and `POST /api/v2/failed-events/:id/retry` management endpoints.
- ✅ `registration_completed_at` flag + `RegistrationFinalizerDestination` + `postUserLoginHook` re-enqueue = self-healing for post-user-registration.
- ✅ `accountLinking` pre-defined post-login hook + `account-linking` template (Auth0-style).
- ✅ `hooks/index.ts` (1155 lines) split by trigger into `user-registration.ts`, `user-update.ts`, `user-deletion.ts`, `post-user-login.ts`, `validate-signup.ts`, `addDataHooks.ts`, and `helpers/token-api.ts`.
- ✅ `flushBackgroundPromises` on non-Workers runtimes so tests observe `waitUntil` work deterministically.
- ✅ Unit + integration tests for `WebhookDestination`, `RegistrationFinalizerDestination`, the `account-linking` template, and the `failed-events` management endpoints.

## Loose ends

### 🟡 Code-hook destination for post-user-registration / post-user-deletion

**Current state.** Webhook delivery for `post-user-registration` and `post-user-deletion` goes through the outbox (retries, dead-letter, self-healing). User-authored **code hooks** for the same triggers still run inline inside `createUserHooks` / `createUserDeletionHooks`. If a code hook throws or times out, its failure is logged but there is no retry and no dead-letter entry.

**Why it's not done yet.** Code-hook execution is wired through `handleCodeHook(ctx, data, hook, event, triggerId, api)` — it needs the original request `ctx` for:

- Serializing a request-context-derived event object to pass into the user code.
- Reading `ctx.env.data.hookCode` for the code blob.
- Reading `ctx.env.codeExecutor` (Cloudflare Dispatch binding) for invocation.

The relay runs in `waitUntil` after the request is closed. Reconstructing a synthetic `ctx` that still has `env.data`, `env.codeExecutor`, and a reasonable request shape is the design gap.

**Likely approach.** Introduce a `CodeHookDestination` constructed per-request in `getDestinations(ctx)` (same pattern as `WebhookDestination`) that captures:

- A closure over `ctx.env.codeExecutor` and `ctx.env.data` (both can outlive the request on Cloudflare Workers because `executionCtx.waitUntil` holds them).
- A reconstructed request object built from the event's `request` field.

Then `deliver()` can fetch the code hook for the event's `trigger_id`, rebuild the event payload, and invoke the executor. The destination must be listed **after** `WebhookDestination` and **before** `RegistrationFinalizerDestination` so the finalizer only flips the flag when all user code succeeded.

**Risks.** If the code hook runtime has any implicit dependency on the live request (header mutation, timing APIs), it will surface here first. Worth budgeting a soak test.

### 🔲 End-to-end self-healing integration test

**Current state.** Unit tests exist for each piece (`WebhookDestination`, `RegistrationFinalizerDestination`, relay dead-letter, `postUserLoginHook` re-enqueue, `failed-events` endpoints). No single test walks a user through:

1. Signup with outbox enabled + webhook that returns 500.
2. Relay retries, dead-letters after 5 attempts.
3. User logs in → re-enqueue.
4. Webhook comes back online → event processes → `registration_completed_at` set.
5. Subsequent login is a no-op.

**Why it's not done yet.** The `getTestServer` fixture doesn't enable the outbox by default — the inline fallback path in `enqueuePostHookEvent` keeps existing webhook tests passing without touching the outbox. An opt-in flag (`getTestServer({ outbox: true })`) that wires `env.outbox = { enabled: true, maxRetries: 2 }` + runs `drainOutbox` on demand would unblock this.

**Value.** Highest-value confidence-builder left on the board; the individual units work but the composition hasn't been proven.

### 🔲 Unified pipeline extraction (`registerUser(ctx, tenantId, input)`)

**Current state.** Decorator shape is preserved — `addDataHooks` wraps `users.create` / `users.update` / `users.remove` with `createUserHooks` / `createUserUpdateHooks` / `createUserDeletionHooks`. The "pipeline" per the original plan (`registerUser(ctx, tenantId, input): Promise<User>` exposed directly to route handlers) is not extracted.

**Why it's not done yet.** The decorator shape works, and migrating every call site of `ctx.env.data.users.create` (management-api/users.ts, universal-login signup screens, `getOrCreateUserByProvider` in social + passwordless, tests, seeds) would be a large surface change for modest gain. Would only be worth it if we wanted to pass pipeline-specific options through the call site (e.g. skip linking, force create even if unverified).

**Revisit when.** Someone needs per-route pipeline customization that can't be expressed through the decorator.

### 🔲 Bulk replay / discard for dead-lettered events

**Current state.** `POST /api/v2/failed-events/:id/retry` replays one event at a time. No bulk endpoint. No discard endpoint.

**Why it's not done yet.** YAGNI — nobody has asked. The normal retention sweep (`outbox.cleanup`) eventually deletes dead-lettered events alongside processed ones after the retention window.

**If it becomes painful.** Add `POST /api/v2/failed-events/bulk-retry` accepting a list of ids, and `DELETE /api/v2/failed-events/:id` for explicit discard. Both are single-adapter changes.

### 🔲 Causal ordering within an aggregate

**Current state.** The relay processes events in (tenant, created_at) order at the batch level but does not group by `aggregate_id`. If two events for the same user land in the same batch (e.g. `hook.post-user-registration` + `hook.post-user-login`), destinations may deliver them in either order.

**Why it's not done yet.** In practice these events rarely pile up for the same aggregate — registration and login don't happen in the same request.

**Revisit when.** We introduce events that really do need in-order delivery (e.g. role-changes where the ordering matters for downstream consumers).

### 🔲 Observability on the relay

**Current state.** `console.warn` on dead-letter, `console.error` on destination failures. No structured metrics.

**Likely next step.** Expose counters (`outbox_events_processed_total`, `outbox_events_dead_lettered_total`, `outbox_retry_delay_seconds_histogram`) behind an optional `observability` binding on `Bindings`. Cloudflare Workers analytics engine is a natural sink.

## Discovered-during-refactor asides (not strictly loose ends)

- The `actions` adapter field on `DataAdapters` was changed from optional to required during the drizzle/aws adapter shake-out. AWS + Drizzle now ship with throwing stubs (`Actions are not implemented in the AWS DynamoDB adapter`). Remove the stubs and ship real implementations if DynamoDB or the experimental Drizzle path ever becomes a production target for tenants that use actions.
- The drizzle schema is kept in sync manually with the kysely SQL migrations (see `packages/drizzle/drizzle/0002_outbox_dead_letter_and_registration_completed.sql`). Worth investigating whether `drizzle-kit` can generate these automatically from the TS schema.
- Several tests (`webhook-error-logging.spec.ts`) assert against the inline-dispatch fallback path. When we finish migrating code hooks to the outbox, those tests need to either enable outbox in the fixture (see next item) or remain as tests of the fallback path.

## How to use this list

- **Picking up unfinished work**: Each entry has a "why not done yet" and a "likely approach / revisit when" so you can gauge ROI before starting.
- **Finishing an item**: Move the entry to the "Completed" section above (add a ✅), adjust the narrative to past tense, and cross-link to the architecture doc section that now describes it.
- **Discovering new work**: Add a 🔲 entry with enough context that someone else can pick it up without an archaeology dig.
