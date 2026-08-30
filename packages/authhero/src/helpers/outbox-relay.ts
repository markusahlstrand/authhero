import { OutboxAdapter, AuditEvent } from "@authhero/adapter-interfaces";
import type { OutboxMetric, OutboxMetricsSink } from "../types/OutboxMetrics";

/**
 * Interface for outbox event destinations.
 * Each destination transforms audit events into its own format and delivers them.
 *
 * Destinations may implement `accepts(event)` to filter which events they
 * handle (e.g. the logs destination only accepts log-shaped events, while a
 * webhook destination only accepts `hook.*` events). If `accepts` is absent,
 * the destination receives every event.
 */
export interface EventDestination {
  name: string;
  accepts?(event: AuditEvent): boolean;
  transform(event: AuditEvent): unknown;
  deliver(events: unknown[]): Promise<void>;
}

const DEFAULT_BATCH_SIZE = 50;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 300_000; // 5 minutes
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_LEASE_MS = 30_000; // 30 seconds

/**
 * Emit a metric without ever letting a broken sink break event delivery.
 */
function emitMetric(sink: OutboxMetricsSink | undefined, metric: OutboxMetric) {
  if (!sink) return;
  try {
    sink(metric);
  } catch (error) {
    console.error("Outbox metrics sink threw", error);
  }
}

async function tryDeadLetter(
  outbox: OutboxAdapter,
  event: Pick<AuditEvent, "id" | "tenant_id" | "event_type"> & {
    retry_count?: number;
  },
  error: string,
  metrics: OutboxMetricsSink | undefined,
  source: "request" | "cron",
): Promise<void> {
  console.warn(`Outbox event ${event.id} dead-lettering: ${error}`);
  emitMetric(metrics, {
    name: "outbox_events_dead_lettered_total",
    value: 1,
    tenantId: event.tenant_id,
    eventType: event.event_type,
    source,
    error,
    ...(event.retry_count !== undefined && { retryCount: event.retry_count }),
  });
  try {
    await outbox.deadLetter(event.id, error);
  } catch {
    // Best effort — event stays in outbox if dead-letter write fails
  }
}

function computeRetryDelayMs(retryCount: number): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
}

function computeNextRetryAt(retryCount: number): string {
  return new Date(Date.now() + computeRetryDelayMs(retryCount)).toISOString();
}

/**
 * Process specific outbox events by their IDs.
 * Used by per-request processing where each request handles only its own events.
 * Claims events first to prevent concurrent processing by drain workers.
 */
export async function processOutboxEvents(
  outbox: OutboxAdapter,
  ids: string[],
  destinations: EventDestination[],
  options?: { maxRetries?: number; metrics?: OutboxMetricsSink },
): Promise<void> {
  if (ids.length === 0) return;

  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const metrics = options?.metrics;

  // Claim events to prevent concurrent processing by drain workers
  const workerId = crypto.randomUUID();
  const claimedIds = await outbox.claimEvents(ids, workerId, DEFAULT_LEASE_MS);
  if (claimedIds.length === 0) return;

  const events = await outbox.getByIds(claimedIds);
  if (events.length === 0) return;

  const processedIds: string[] = [];

  for (const event of events) {
    if (event.retry_count >= maxRetries) {
      await tryDeadLetter(
        outbox,
        event,
        event.error || `Exceeded max retries (${maxRetries})`,
        metrics,
        "request",
      );
      continue;
    }

    let allSucceeded = true;
    let anyDestinationAccepted = false;

    for (const destination of destinations) {
      if (destination.accepts && !destination.accepts(event)) continue;
      anyDestinationAccepted = true;
      try {
        const transformed = destination.transform(event);
        await destination.deliver([transformed]);
      } catch (error) {
        allSucceeded = false;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        emitMetric(metrics, {
          name: "outbox_retry_delay_seconds",
          value: computeRetryDelayMs(event.retry_count) / 1000,
          tenantId: event.tenant_id,
          eventType: event.event_type,
          source: "request",
          destination: destination.name,
          error: errorMessage,
          retryCount: event.retry_count,
        });
        try {
          await outbox.markRetry(
            event.id,
            `${destination.name}: ${errorMessage}`,
            computeNextRetryAt(event.retry_count),
          );
        } catch {
          // Best effort
        }
        break;
      }
    }

    if (!anyDestinationAccepted) {
      await tryDeadLetter(
        outbox,
        event,
        `No destination accepts event_type=${event.event_type}`,
        metrics,
        "request",
      );
      continue;
    }

    if (allSucceeded) {
      processedIds.push(event.id);
      emitMetric(metrics, {
        name: "outbox_events_processed_total",
        value: 1,
        tenantId: event.tenant_id,
        eventType: event.event_type,
        source: "request",
        retryCount: event.retry_count,
      });
    }
  }

  if (processedIds.length > 0) {
    try {
      await outbox.markProcessed(processedIds);
    } catch {
      // Best effort
    }
  }
}

/**
 * Drain unprocessed events from the outbox and deliver to all destinations.
 * Intended for cron/scheduled use to sweep up events that failed per-request processing.
 * Uses claim mechanism for safe multi-worker execution.
 */
export async function drainOutbox(
  outbox: OutboxAdapter,
  destinations: EventDestination[],
  options?: {
    batchSize?: number;
    maxRetries?: number;
    retentionDays?: number;
    metrics?: OutboxMetricsSink;
  },
): Promise<void> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const metrics = options?.metrics;

  const events = await outbox.getUnprocessed(batchSize);
  if (events.length === 0) return;

  // Claim events to prevent concurrent workers from processing the same batch
  const workerId = crypto.randomUUID();
  const allIds = events.map((e) => e.id);
  const claimedIds = new Set(
    await outbox.claimEvents(allIds, workerId, DEFAULT_LEASE_MS),
  );
  const claimedEvents = events.filter((e) => claimedIds.has(e.id));
  if (claimedEvents.length === 0) return;

  const processedIds: string[] = [];
  const failedIds: string[] = [];

  for (const event of claimedEvents) {
    // Move exhausted events to dead-letter so they don't block the queue and
    // are still visible via the failed-events management endpoints.
    if (event.retry_count >= maxRetries) {
      await tryDeadLetter(
        outbox,
        event,
        event.error || `Exceeded max retries (${maxRetries})`,
        metrics,
        "cron",
      );
      continue;
    }

    let allSucceeded = true;
    let anyDestinationAccepted = false;

    for (const destination of destinations) {
      if (destination.accepts && !destination.accepts(event)) continue;
      anyDestinationAccepted = true;
      try {
        const transformed = destination.transform(event);
        await destination.deliver([transformed]);
      } catch (error) {
        allSucceeded = false;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        emitMetric(metrics, {
          name: "outbox_retry_delay_seconds",
          value: computeRetryDelayMs(event.retry_count) / 1000,
          tenantId: event.tenant_id,
          eventType: event.event_type,
          source: "cron",
          destination: destination.name,
          error: errorMessage,
          retryCount: event.retry_count,
        });
        try {
          await outbox.markRetry(
            event.id,
            `${destination.name}: ${errorMessage}`,
            computeNextRetryAt(event.retry_count),
          );
        } catch {
          // Best effort — if marking retry fails, the event stays unprocessed
        }
        break; // Don't try other destinations for this event
      }
    }

    if (!anyDestinationAccepted) {
      await tryDeadLetter(
        outbox,
        event,
        `No destination accepts event_type=${event.event_type}`,
        metrics,
        "cron",
      );
      continue;
    }

    if (allSucceeded) {
      processedIds.push(event.id);
      emitMetric(metrics, {
        name: "outbox_events_processed_total",
        value: 1,
        tenantId: event.tenant_id,
        eventType: event.event_type,
        source: "cron",
        retryCount: event.retry_count,
      });
    } else {
      failedIds.push(event.id);
    }
  }

  // Mark all successful events as processed in one batch
  if (processedIds.length > 0) {
    try {
      await outbox.markProcessed(processedIds);
    } catch {
      // Best effort
    }
  }

  // Cleanup: delete processed events past retention period
  try {
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    await outbox.cleanup(cutoff);
  } catch {
    // Best effort — cleanup failure should not affect request processing
  }
}
