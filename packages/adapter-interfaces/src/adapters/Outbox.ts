import { AuditEvent, AuditEventInsert } from "../types/AuditEvent";

export interface OutboxEvent extends AuditEvent {
  /** When the event was persisted to the outbox */
  created_at: string;
  /** When the event was successfully processed (null if pending) */
  processed_at: string | null;
  /** Number of delivery attempts */
  retry_count: number;
  /** When to attempt the next retry (null if not in retry state) */
  next_retry_at: string | null;
  /** Last error message from a failed delivery attempt */
  error: string | null;
}

export interface OutboxAdapter {
  /** Write an audit event to the outbox. Returns the event ID. */
  create(tenantId: string, event: AuditEventInsert): Promise<string>;
  /** Fetch events by their IDs */
  getByIds(ids: string[]): Promise<OutboxEvent[]>;
  /** Fetch unprocessed events ready for delivery */
  getUnprocessed(limit: number): Promise<OutboxEvent[]>;
  /** Atomically claim events for exclusive processing. Returns IDs that were successfully claimed. */
  claimEvents(
    ids: string[],
    workerId: string,
    leaseMs: number,
  ): Promise<string[]>;
  /** Mark events as successfully processed */
  markProcessed(ids: string[]): Promise<void>;
  /** Mark an event for retry with a backoff delay */
  markRetry(id: string, error: string, nextRetryAt: string): Promise<void>;
  /** Delete processed events older than the given ISO date. Returns count deleted. */
  cleanup(olderThan: string): Promise<number>;
}
