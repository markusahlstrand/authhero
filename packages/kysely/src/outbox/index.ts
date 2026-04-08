import { Kysely } from "kysely";
import { OutboxAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { createOutboxEvent } from "./create";
import { getOutboxEventsByIds } from "./getByIds";
import { getUnprocessedOutboxEvents } from "./getUnprocessed";
import { claimOutboxEvents } from "./claimEvents";
import { markOutboxEventsProcessed } from "./markProcessed";
import { markOutboxEventRetry } from "./markRetry";
import { cleanupOutboxEvents } from "./cleanup";

export function createOutboxAdapter(db: Kysely<Database>): OutboxAdapter {
  return {
    create: createOutboxEvent(db),
    getByIds: getOutboxEventsByIds(db),
    getUnprocessed: getUnprocessedOutboxEvents(db),
    claimEvents: claimOutboxEvents(db),
    markProcessed: markOutboxEventsProcessed(db),
    markRetry: markOutboxEventRetry(db),
    cleanup: cleanupOutboxEvents(db),
  };
}
