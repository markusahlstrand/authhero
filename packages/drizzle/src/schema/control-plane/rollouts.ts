import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Fleet rollout records (issue #1026). Progress is derived by querying
 * `tenant_operations` rows carrying this rollout's id — no denormalized
 * counters. Mirrors the kysely adapter's `rollouts` table.
 */
export const rollouts = sqliteTable("rollouts", {
  id: text("id", { length: 255 }).primaryKey(),
  kind: text("kind", { length: 32 }).notNull(),
  status: text("status", { length: 32 }).notNull(),
  target_worker_version: text("target_worker_version", { length: 255 }),
  target_database_version: text("target_database_version", { length: 255 }),
  wave_size: integer("wave_size").notNull().default(10),
  canary_tenant_ids: text("canary_tenant_ids"), // JSON array of tenant ids
  filter: text("filter"), // JSON tenant filter
  initiated_by: text("initiated_by", { length: 255 }),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
  finished_at: text("finished_at", { length: 35 }),
});
