import { AuditEvent, AuditCategory } from "@authhero/adapter-interfaces";
import { EventDestination } from "../outbox-relay";

const DEFAULT_DELIVERY_TIMEOUT_MS = 10_000;

/**
 * One row of the archive table. The promoted columns are the query and
 * erasure keys (`actor_id` / `target_id`); `event` carries the untouched
 * `AuditEvent` so nothing is lost and the promoted set can grow later
 * without a backfill.
 *
 * `actor_id` is emitted as `null` rather than omitted when the actor is
 * anonymous, so every record has the same key set — Pipelines stream
 * schemas are fixed once created.
 */
export interface PipelineRecord {
  id: string;
  timestamp: string;
  tenant_id: string;
  event_type: string;
  log_type: string;
  category: AuditCategory;
  actor_id: string | null;
  target_type: string;
  target_id: string;
  event: AuditEvent;
}

export interface PipelineDestinationOptions {
  /** Stream HTTP ingest endpoint, e.g. `https://<stream-id>.ingest.cloudflare.com`. */
  endpoint: string;
  /** Stream ingest token, sent as `Authorization: Bearer`. */
  token: string;
  /** Per-request timeout (default: 10s). */
  timeoutMs?: number;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Archives audit events to a Cloudflare Pipelines stream, which lands them in
 * R2 as an Iceberg table. See `apps/docs/architecture/audit-archive.md`.
 *
 * HTTP ingest is used rather than the Worker binding so the destination works
 * in every deployment (Node included) and stays symmetric with the
 * log-streams destination.
 *
 * Duplicates are expected and by design: the relay retries per event, not per
 * destination, so a failure in a later destination re-delivers this one, and
 * the Iceberg sink is append-only. Consumers dedup on `id` at query time.
 */
export class PipelineDestination implements EventDestination {
  name = "pipeline";
  private endpoint: string;
  private token: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: PipelineDestinationOptions) {
    this.endpoint = options.endpoint;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_DELIVERY_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Archives the audit trail, not the delivery plumbing: `hook.*` and
   * `controlplane.sync.*` are instructions to other destinations rather than
   * records of something a tenant did. Same filter as the log-streams
   * destination.
   */
  accepts(event: AuditEvent): boolean {
    return (
      !event.event_type.startsWith("hook.") &&
      !event.event_type.startsWith("controlplane.sync.")
    );
  }

  transform(event: AuditEvent): PipelineRecord {
    return {
      id: event.id,
      timestamp: event.timestamp,
      tenant_id: event.tenant_id,
      event_type: event.event_type,
      log_type: event.log_type,
      category: event.category,
      actor_id: event.actor.id ?? null,
      target_type: event.target.type,
      target_id: event.target.id,
      event,
    };
  }

  async deliver(records: PipelineRecord[]): Promise<void> {
    if (records.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // Pipelines stream ingest takes a JSON array of records per POST, so a
      // multi-event batch is one request.
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(records),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Pipeline ingest returned ${response.status}: ${body.slice(0, 256)}`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
