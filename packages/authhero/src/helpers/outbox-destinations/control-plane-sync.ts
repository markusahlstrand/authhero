import { AuditEvent } from "@authhero/adapter-interfaces";
import { EventDestination } from "../outbox-relay";
import {
  CONTROL_PLANE_SYNC_EVENT_PREFIX,
  SyncEntity,
  SyncEvent,
  SyncOp,
} from "../control-plane-sync-events";
import type { GetServiceToken } from "./webhooks";

const DEFAULT_DELIVERY_TIMEOUT_MS = 10_000;
const DEFAULT_SCOPE = "controlplane:sync";
const SYNC_PATH = "/api/v2/proxy/control-plane/sync";

const SYNC_ENTITIES: ReadonlySet<SyncEntity> = new Set<SyncEntity>([
  "proxy_route",
]);
const SYNC_OPS: ReadonlySet<SyncOp> = new Set<SyncOp>([
  "created",
  "updated",
  "deleted",
]);

function isSyncEntity(v: string): v is SyncEntity {
  return SYNC_ENTITIES.has(v as SyncEntity);
}

function isSyncOp(v: string): v is SyncOp {
  return SYNC_OPS.has(v as SyncOp);
}

export interface ControlPlaneSyncDestinationOptions {
  /** Base URL of the control-plane authhero instance, e.g. `https://controlplane.example.com`. */
  baseUrl: string;
  /** Mints a bearer token to authenticate the sync POST. */
  getServiceToken: GetServiceToken;
  /** Per-request timeout (default: 10s). */
  timeoutMs?: number;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Delivers `controlplane.sync.*` outbox events to the global control-plane
 * `POST /api/v2/proxy/control-plane/sync` endpoint. Each POST carries one event
 * with `Idempotency-Key: {event.id}` so the receiver can dedupe retries.
 *
 * The receiver MUST be idempotent: the outbox retries on network failure even
 * after a successful write, so a `created` may arrive twice and a stale
 * `updated` may arrive after a newer `deleted`. The default receiver in
 * `proxy-control-plane/index.ts` handles both cases.
 */
export class ControlPlaneSyncDestination implements EventDestination {
  name = "control-plane-sync";
  private baseUrl: string;
  private getServiceToken: GetServiceToken;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: ControlPlaneSyncDestinationOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getServiceToken = options.getServiceToken;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  accepts(event: AuditEvent): boolean {
    return event.event_type.startsWith(CONTROL_PLANE_SYNC_EVENT_PREFIX);
  }

  transform(event: AuditEvent): SyncEvent {
    const suffix = event.event_type.slice(
      CONTROL_PLANE_SYNC_EVENT_PREFIX.length,
    );
    const [entity, op] = suffix.split(".");
    if (!entity || !isSyncEntity(entity)) {
      throw new Error(
        `ControlPlaneSyncDestination: unknown entity in event_type "${event.event_type}"`,
      );
    }
    if (!op || !isSyncOp(op)) {
      throw new Error(
        `ControlPlaneSyncDestination: unknown op in event_type "${event.event_type}"`,
      );
    }
    const payload = event.target.after ?? event.target.before;
    if (!payload) {
      throw new Error(
        `ControlPlaneSyncDestination: event ${event.id} has no payload (target.after/before)`,
      );
    }

    return {
      event_id: event.id,
      tenant_id: event.tenant_id,
      entity,
      op,
      aggregate_id: event.target.id,
      // The audit-event storage is `Record<string, unknown>`; the wire format
      // re-narrows to the entity type. The receiver re-validates via zod
      // before dispatching to the adapter.
      payload,
      occurred_at: event.timestamp,
    } as SyncEvent;
  }

  async deliver(events: SyncEvent[]): Promise<void> {
    for (const evt of events) {
      const token = await this.getServiceToken(evt.tenant_id, DEFAULT_SCOPE);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${SYNC_PATH}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": evt.event_id,
          },
          body: JSON.stringify({ events: [evt] }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `Control-plane sync POST returned ${response.status}: ${body.slice(0, 256)}`,
          );
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
