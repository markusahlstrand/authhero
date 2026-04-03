import { Kysely } from "kysely";
import { OutboxAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { createOutboxEvent } from "./create";
import { getUnprocessedOutboxEvents } from "./getUnprocessed";
import { markOutboxEventsProcessed } from "./markProcessed";
import { markOutboxEventRetry } from "./markRetry";
import { cleanupOutboxEvents } from "./cleanup";

export function createOutboxAdapter(db: Kysely<Database>): OutboxAdapter {
  return {
    create: createOutboxEvent(db),
    getUnprocessed: getUnprocessedOutboxEvents(db),
    markProcessed: markOutboxEventsProcessed(db),
    markRetry: markOutboxEventRetry(db),
    cleanup: cleanupOutboxEvents(db),
  };
}
