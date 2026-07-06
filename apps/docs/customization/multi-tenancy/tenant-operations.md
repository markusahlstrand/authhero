---
title: Tenant Operations
description: Durable tenant lifecycle operations (provision, upgrade, backup) with an append-only history, an inline executor, and a Cloudflare Workflows engine.
---

# Tenant Operations

Tenant lifecycle work — provisioning a WFP tenant's D1, seeding its defaults, upgrading its worker bundle — used to run as one-shot imperative sequences: no retries surviving a redeploy, no history of what was attempted, and a failed seed could leave a tenant marked `ready` over an empty database.

Tenant operations (issue #1026) fix this with two pieces:

1. **A control-plane log**: `tenant_operations` (one row per run: kind, status, engine, error, timestamps) and `tenant_operation_events` (append-only per-step history). The tenant row's `provisioning_state` / `worker_version` / `database_version` stay the _current-state snapshot_; operations are the log explaining how it got there.
2. **Swappable executors**: an inline executor that runs steps synchronously, and a Cloudflare Workflows executor that runs the same steps durably with per-step retries. The control-plane database is always the source of truth — the engine is just the executor.

## Data model

The tables are **control-plane only** — they never exist in a WFP tenant's D1:

- **kysely**: shipped in the normal migration chain (kysely only runs control planes).
- **drizzle**: shipped as a separate `drizzle-control-plane/` migration set with its own journal. Apply it _in addition to_ the core set, with a distinct migrations table:

```typescript
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

migrate(db, { migrationsFolder: "node_modules/@authhero/drizzle/drizzle" });
migrate(db, {
  migrationsFolder: "node_modules/@authhero/drizzle/drizzle-control-plane",
  migrationsTable: "__drizzle_migrations_control_plane",
});
```

Then opt the adapter factory in — the adapters' presence is also what mounts the management routes:

```typescript
const adapters = createAdapters(db, { controlPlane: true });
```

## Recording (no behavior change)

When the control plane carries the operations adapters, `createProvisioningHooks` automatically wraps `databaseIsolation.onProvision` so every provision writes an operation row with step events (`provision-resources`, `seed-defaults` when using the WFP hook). Failures are recorded with the error and rethrown — rollback semantics are unchanged, and a deployment without the adapters behaves exactly as before.

## Management API

Mounted only when the operations adapters are present. Scopes: `read:tenant_operations`, `create:tenant_operations`.

| Route                                  | Purpose                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /api/v2/tenants/{id}/operations`  | Paginated history for a tenant (filters: `kind`, `status`)                                         |
| `GET /api/v2/operations/{id}`          | One operation plus its full event timeline                                                         |
| `POST /api/v2/tenants/{id}/operations` | Enqueue `{ "kind": "upgrade" }` (control-plane only; retry = enqueue again — steps are idempotent) |

Clients poll `GET /operations/{id}` while an operation runs; the inline engine returns it already terminal.

## Durable provisioning on Cloudflare Workflows

`@authhero/cloudflare-adapter/workflows` runs the full provision sequence as one durable engine instance per tenant:

```
mark-running → create-database → apply-migrations → upload-script →
upload-secrets → seed-defaults → verify → mark-ready
```

Two steps close the "ready but empty D1" incident class permanently:

- **seed-defaults** is a retried step _before_ `ready` whose per-entity errors fail the operation (not a `console.error`).
- **verify** queries the tenant D1 (via the same REST path migrations use) and throws until it actually holds signing keys and the tenant row — a propagation race becomes a few retried verifies.

The workflow writes back to the operation log inside every `step.do`, so the history is durable too. If an instance dies before its terminal write, `reconcileTenantOperations` (run from the worker's `scheduled` handler — at least daily; engine retention is 30 days) copies the engine's terminal state into the database.

### Wiring the downstream worker

The deploy repo owns the ~10-line `WorkflowEntrypoint` shell (only it can import `cloudflare:workers`); everything else comes from the library. See `entrypoint.example.ts` in `@authhero/cloudflare-adapter` for the full reference, including `buildProvisionDeps(env)` and the `scheduled` handler.

Tenant create flips from inline provisioning to a durable enqueue:

```typescript
const workflowHook = createWfpWorkflowProvisioningHook({
  tenants: adapters.tenants,
  inline: inlineHook, // upgrade/deprovision stay inline for now
  enqueueOperation: (input) =>
    enqueueTenantOperation(
      stores,
      createCloudflareWorkflowsExecutor({
        binding: env.TENANT_OPERATIONS_WORKFLOW,
      }),
      input,
    ),
});

// databaseIsolation: {
//   onProvision: workflowHook.onProvision,
//   onDeprovision: workflowHook.onDeprovision,
//   recordProvisionOperations: false, // the workflow owns the operation row
// }
```

::: warning Semantic change
With the workflow hook, tenant-create returns while the tenant is still `provisioning_state: "pending"` — the workflow marks it `ready` (or `failed`). Clients must poll the tenant row or the operations API instead of assuming a synchronous `ready`. Any best-effort post-create seed should be deleted; the seed is a durable step inside the workflow.
:::

Rollout order for an existing deployment: apply the control-plane migrations, deploy the worker with both paths available, then flip tenant-create to the workflow hook.

## Roadmap

Later phases add per-tenant durable upgrades, fleet rollouts (waves + canary + health gate over the `rollouts` table), and D1 Time Travel backups — see [issue #1026](https://github.com/markusahlstrand/authhero/issues/1026).
