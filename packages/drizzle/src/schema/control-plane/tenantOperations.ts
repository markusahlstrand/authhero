import {
  sqliteTable,
  text,
  integer,
  index,
  foreignKey,
} from "drizzle-orm/sqlite-core";

/**
 * Durable tenant lifecycle operations (issue #1026): one row per
 * provision / seed / upgrade / backup / deprovision run. Intentionally no
 * FK to `tenants` — the log must survive tenant deletion, and `tenant_id`
 * is NULL for fleet-level operations. Mirrors the kysely adapter's
 * `tenant_operations` table.
 */
export const tenantOperations = sqliteTable(
  "tenant_operations",
  {
    id: text("id", { length: 255 }).primaryKey(),
    tenant_id: text("tenant_id", { length: 255 }),
    rollout_id: text("rollout_id", { length: 255 }),
    kind: text("kind", { length: 32 }).notNull(),
    status: text("status", { length: 32 }).notNull(),
    current_step: text("current_step", { length: 255 }),
    engine: text("engine", { length: 64 }).notNull(),
    engine_instance_id: text("engine_instance_id", { length: 100 }),
    target_worker_version: text("target_worker_version", { length: 255 }),
    target_database_version: text("target_database_version", { length: 255 }),
    error: text("error"),
    initiated_by: text("initiated_by", { length: 255 }),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
    finished_at: text("finished_at", { length: 35 }),
  },
  (table) => [
    index("tenant_operations_tenant_id_created_at_idx").on(
      table.tenant_id,
      table.created_at,
    ),
    index("tenant_operations_rollout_id_idx").on(table.rollout_id),
    index("tenant_operations_status_idx").on(table.status),
  ],
);

/**
 * Append-only per-step history for tenant operations.
 */
export const tenantOperationEvents = sqliteTable(
  "tenant_operation_events",
  {
    id: text("id", { length: 255 }).primaryKey(),
    operation_id: text("operation_id", { length: 255 }).notNull(),
    step: text("step", { length: 255 }).notNull(),
    outcome: text("outcome", { length: 32 }).notNull(),
    detail: text("detail"), // JSON
    attempt: integer("attempt").notNull().default(1),
    created_at: text("created_at", { length: 35 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.operation_id],
      foreignColumns: [tenantOperations.id],
      name: "tenant_operation_events_operation_id_constraint",
    }).onDelete("cascade"),
    index("tenant_operation_events_operation_id_created_at_idx").on(
      table.operation_id,
      table.created_at,
    ),
  ],
);
