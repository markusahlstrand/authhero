import { OutboxAdapter, AuditEvent } from "@authhero/adapter-interfaces";

/**
 * Interface for outbox event destinations.
 * Each destination transforms audit events into its own format and delivers them.
 */
export interface EventDestination {
  name: string;
  transform(event: AuditEvent): unknown;
  deliver(events: unknown[]): Promise<void>;
}

const DEFAULT_BATCH_SIZE = 50;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 300_000; // 5 minutes
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_LEASE_MS = 30_000; // 30 seconds

function computeNextRetryAt(retryCount: number): string {
  const delayMs = Math.min(
    BASE_DELAY_MS * Math.pow(2, retryCount),
    MAX_DELAY_MS,
  );
  return new Date(Date.now() + delayMs).toISOString();
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
  options?: { maxRetries?: number },
): Promise<void> {
  if (ids.length === 0) return;

  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  // Claim events to prevent concurrent processing by drain workers
  const workerId = crypto.randomUUID();
  const claimedIds = await outbox.claimEvents(ids, workerId, DEFAULT_LEASE_MS);
  if (claimedIds.length === 0) return;

  const events = await outbox.getByIds(claimedIds);
  if (events.length === 0) return;

  const processedIds: string[] = [];

  for (const event of events) {
    if (event.retry_count >= maxRetries) {
      console.warn(
        `Outbox event ${event.id} exceeded max retries (${maxRetries}), marking as processed. Last error: ${event.error}`,
      );
      processedIds.push(event.id);
      continue;
    }

    let allSucceeded = true;

    for (const destination of destinations) {
      try {
        const transformed = destination.transform(event);
        await destination.deliver([transformed]);
      } catch (error) {
        allSucceeded = false;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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

    if (allSucceeded) {
      processedIds.push(event.id);
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
  options?: { batchSize?: number; maxRetries?: number; retentionDays?: number },
): Promise<void> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;

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
    // Mark exhausted events as processed so they don't block the queue
    if (event.retry_count >= maxRetries) {
      console.warn(
        `Outbox event ${event.id} exceeded max retries (${maxRetries}), marking as processed. Last error: ${event.error}`,
      );
      processedIds.push(event.id);
      continue;
    }

    let allSucceeded = true;

    for (const destination of destinations) {
      try {
        const transformed = destination.transform(event);
        await destination.deliver([transformed]);
      } catch (error) {
        allSucceeded = false;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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

    if (allSucceeded) {
      processedIds.push(event.id);
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
