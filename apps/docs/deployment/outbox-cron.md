---
title: Outbox Relay (Cron)
description: Run the transactional outbox relay from a scheduled handler to sweep up webhook and audit events that failed inline delivery.
---

# Outbox Relay (Cron)

AuthHero delivers audit events and webhook dispatches through a transactional outbox. Most events are delivered per-request by the inline dispatcher, but transient failures (a webhook 5xx, a dropped connection) leave events in the outbox. A scheduled handler sweeps those up.

## When you need this

You need a scheduled handler if **any** of the following is true:

- You enabled the outbox (`outbox: { enabled: true }` on `init()`)
- You deliver `hook.*` webhooks and want at-least-once delivery under transient failure
- You want processed events cleaned up on a retention schedule

If outbox is disabled, webhook delivery is fire-and-forget per request with no retry — no cron is possible or needed.

## One-call handler: `runOutboxRelay`

`runOutboxRelay` is the entire body of a scheduled handler. It builds the same destinations the inline dispatcher uses, mints per-tenant `auth-service` tokens via the same in-process path, drains the outbox, and cleans up processed events past the retention window.

```ts
import { runOutboxRelay } from "authhero";

export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    await runOutboxRelay({
      dataAdapter,
      issuer: env.ISSUER,
      webhookInvoker, // same function passed to init()
      retentionDays: 7,
    });
  },
};
```

### Configuration

| Field | Required | Description |
| --- | --- | --- |
| `dataAdapter` | yes | Same `DataAdapters` you pass to `init()`. Must include `outbox` — the call is a no-op if it doesn't. |
| `issuer` | yes | Issuer URL used when minting `auth-service` tokens. Typically `env.ISSUER`. Webhook receivers that validate `iss` will accept tokens from both the inline and cron paths. |
| `webhookInvoker` | no | Same shape as the `webhookInvoker` option on `init()`. **Pass the same function** — see below. |
| `retentionDays` | no | Days to keep processed events before cleanup. Default `7`. |
| `batchSize` | no | Max events per drain pass. Forwarded to `drainOutbox`. |
| `maxRetries` | no | Max delivery attempts before an event is dead-lettered. Forwarded to `drainOutbox`. |
| `webhookTimeoutMs` | no | HTTP timeout when the default invoker is used. Default `10000`. |

### Pass the same `webhookInvoker` you pass to `init()`

If you provide a custom `webhookInvoker` to `init()` — e.g. to strip sensitive fields, add a signing header, or route to a non-HTTP transport — you **must** pass the same function to `runOutboxRelay`. Otherwise cron-drained deliveries will silently skip your invoker and fall back to a plain `Authorization: Bearer <service-token>` POST, diverging from the inline path.

```ts
// Shared module — imported by init() and the scheduled handler
export const webhookInvoker: WebhookInvoker = async ({
  hook,
  data,
  tenant_id,
  createServiceToken,
}) => {
  const token = await createServiceToken();
  return fetch(hook.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Tenant-Id": tenant_id,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(redactInternal(data)),
  });
};
```

## Cloudflare Workers example

Wire a cron trigger in `wrangler.toml`:

```toml
[triggers]
crons = ["*/5 * * * *"]  # Every 5 minutes
```

Then in your worker entry:

```ts
import { initMultiTenant, runOutboxRelay } from "authhero";
import { webhookInvoker } from "./webhook-invoker";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const dataAdapter = createCloudflareD1Adapter(env.AUTH_DB);
    const { app } = initMultiTenant({
      dataAdapter,
      webhookInvoker,
      outbox: { enabled: true },
    });
    return app.fetch(request, env, ctx);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const dataAdapter = createCloudflareD1Adapter(env.AUTH_DB);
    ctx.waitUntil(
      runOutboxRelay({
        dataAdapter,
        issuer: env.ISSUER,
        webhookInvoker,
        retentionDays: 7,
      }),
    );
  },
};
```

### Picking a cron interval

- **Every 5 minutes** is a reasonable default. Inline delivery handles the happy path; the cron only picks up events that failed a retry.
- Shorter intervals reduce time-to-delivery after a webhook receiver recovers from an outage, at the cost of more idle invocations.
- The relay claims events with a short lease, so overlapping invocations are safe — two workers running concurrently won't double-deliver.

## Node / Docker / other platforms

Any scheduler can drive the relay. Call `runOutboxRelay` on a timer:

```ts
import { runOutboxRelay } from "authhero";

setInterval(() => {
  runOutboxRelay({
    dataAdapter,
    issuer: process.env.ISSUER!,
    webhookInvoker,
    retentionDays: 7,
  }).catch((err) => console.error("outbox relay failed", err));
}, 5 * 60 * 1000);
```

For Kubernetes / systemd, wire the same call to a cron-style job that runs every 5 minutes and exits.

## Lower-level escape hatches

If `runOutboxRelay` doesn't fit your shape, the pieces it composes are individually exported:

- `drainOutbox(outbox, destinations, options?)` — processes one batch of unprocessed events.
- `cleanupOutbox(outbox, { retentionDays })` — deletes processed events past the retention window.
- `createDefaultDestinations({ dataAdapter, getServiceToken?, webhookInvoker?, webhookTimeoutMs? })` — builds the `[LogsDestination, WebhookDestination, RegistrationFinalizerDestination]` array the inline dispatcher uses. Pass `webhookInvoker` here too for parity with the inline path.
- `LogsDestination`, `WebhookDestination`, `RegistrationFinalizerDestination`, and the `EventDestination` interface — for fully custom destination arrays.

## What happens to stuck events

Events that exceed `maxRetries` (default `5`) are moved to a dead-letter state. They stop blocking the queue and are visible through the management API. See [Failed Events](/customization/failed-events) for inspection and replay.

## Related

- [Audit Events Architecture](/architecture/audit-events) — why the outbox exists and how it guarantees atomicity
- [Outbox Adapter](/customization/adapter-interfaces/outbox) — adapter interface reference
- [Failed Events (Dead-letter)](/customization/failed-events) — inspecting and replaying events that exhausted retries
