import { Context } from "hono";
import {
  AuditEventInsert,
  CustomDomain,
  LogTypes,
  ProxyRoute,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";

export const CONTROL_PLANE_SYNC_EVENT_PREFIX = "controlplane.sync.";

export type SyncEntity = "custom_domain" | "proxy_route";
export type SyncOp = "created" | "updated" | "deleted";

/**
 * Wire shape posted from the tenant shard to the control plane. The destination
 * serializes one event per HTTP request; the receiver accepts a batch
 * (`{ events: [...] }`) for forward compatibility with a future
 * batched-delivery destination.
 */
export type SyncEvent =
  | {
      event_id: string;
      tenant_id: string;
      entity: "custom_domain";
      op: "created" | "updated";
      aggregate_id: string;
      payload: CustomDomain;
      occurred_at: string;
    }
  | {
      event_id: string;
      tenant_id: string;
      entity: "custom_domain";
      op: "deleted";
      aggregate_id: string;
      payload: CustomDomain;
      occurred_at: string;
    }
  | {
      event_id: string;
      tenant_id: string;
      entity: "proxy_route";
      op: "created" | "updated";
      aggregate_id: string;
      payload: ProxyRoute;
      occurred_at: string;
    }
  | {
      event_id: string;
      tenant_id: string;
      entity: "proxy_route";
      op: "deleted";
      aggregate_id: string;
      payload: ProxyRoute;
      occurred_at: string;
    };

interface EnqueueArgs {
  tenantId: string;
  entity: SyncEntity;
  op: SyncOp;
  aggregateId: string;
  payload: CustomDomain | ProxyRoute;
}

/**
 * Enqueue a `controlplane.sync.*` event to the outbox so the
 * `ControlPlaneSyncDestination` can replicate the mutation to the global
 * control-plane data store.
 *
 * Mirrors the pattern used by `enqueuePostHookEvent`: pushes the
 * `outbox.create` promise onto `ctx.var.outboxEventPromises` so the outbox
 * middleware awaits it in its finally block. No-op when the outbox is not
 * configured — single-DB deployments don't need sync.
 */
export function enqueueControlPlaneSyncEvent(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  args: EnqueueArgs,
): void {
  if (!ctx.env.outbox?.enabled || !ctx.env.data.outbox) return;

  const event: AuditEventInsert = {
    tenant_id: args.tenantId,
    event_type: `${CONTROL_PLANE_SYNC_EVENT_PREFIX}${args.entity}.${args.op}`,
    // log_type is inert: LogsDestination filters out controlplane.sync.* by
    // event_type prefix. A neutral value keeps the AuditEventInsert schema
    // valid for adapters that store it.
    log_type: LogTypes.SUCCESS_API_OPERATION,
    description: `Replicate ${args.entity} ${args.op} to control plane`,
    category: "system",
    actor: {
      type: ctx.var.user_id
        ? "admin"
        : ctx.var.client_id
          ? "client_credentials"
          : "system",
      id: ctx.var.user_id || undefined,
      client_id: ctx.var.client_id || undefined,
    },
    target: {
      type: args.entity,
      id: args.aggregateId,
      after: args.payload as unknown as Record<string, unknown>,
    },
    request: {
      method: ctx.req.method,
      path: ctx.req.path,
      ip: ctx.var.ip || "",
      user_agent: ctx.var.useragent || undefined,
    },
    hostname: ctx.var.host || "",
    auth0_client: ctx.var.auth0_client,
    timestamp: new Date().toISOString(),
  };

  const promise = ctx.env.data.outbox.create(args.tenantId, event);
  const existing = ctx.var.outboxEventPromises || [];
  existing.push(promise);
  ctx.set("outboxEventPromises", existing);
}
