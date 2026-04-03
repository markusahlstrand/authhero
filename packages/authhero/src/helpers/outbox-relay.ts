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

function computeNextRetryAt(retryCount: number): string {
  const delayMs = Math.min(
    BASE_DELAY_MS * Math.pow(2, retryCount),
    MAX_DELAY_MS,
  );
  return new Date(Date.now() + delayMs).toISOString();
}

/**
 * Drain unprocessed events from the outbox and deliver to all destinations.
 * Each destination is processed independently — a failure in one does not block others.
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

  const processedIds: string[] = [];
  const failedIds: string[] = [];

  for (const event of events) {
    // Skip events that have exceeded max retries
    if (event.retry_count >= maxRetries) {
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
