import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id", { length: 26 }).primaryKey(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    event_type: text("event_type", { length: 64 }).notNull(),
    log_type: text("log_type", { length: 64 }).notNull(),
    aggregate_type: text("aggregate_type", { length: 64 }).notNull(),
    aggregate_id: text("aggregate_id", { length: 255 }).notNull(),
    payload: text("payload").notNull(),
    created_at: text("created_at", { length: 35 }).notNull(),
    processed_at: text("processed_at", { length: 35 }),
    retry_count: integer("retry_count").notNull().default(0),
    next_retry_at: text("next_retry_at", { length: 35 }),
    error: text("error"),
    claimed_by: text("claimed_by", { length: 255 }),
    claim_expires_at: text("claim_expires_at", { length: 35 }),
  },
  (table) => [
    index("idx_outbox_events_tenant_id").on(table.tenant_id),
    index("idx_outbox_events_processed_at").on(table.processed_at),
    index("idx_outbox_events_claimed_by").on(table.claimed_by),
  ],
);
