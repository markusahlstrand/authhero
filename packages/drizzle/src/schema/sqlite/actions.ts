import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";

// Mirrors the kysely `actions` table. Dates are stored as epoch-millisecond
// integers (`_ts` suffix) and surfaced as ISO strings by the adapter, matching
// the kysely backend. JSON-valued columns (secrets/dependencies/
// supported_triggers) are stored as serialized text.
export const actions = sqliteTable(
  "actions",
  {
    id: text("id", { length: 255 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name", { length: 255 }).notNull(),
    code: text("code").notNull(),
    runtime: text("runtime", { length: 50 }),
    status: text("status", { length: 16 }),
    secrets: text("secrets"),
    dependencies: text("dependencies"),
    supported_triggers: text("supported_triggers"),
    deployed_at_ts: integer("deployed_at_ts"),
    is_system: integer("is_system"),
    inherit: integer("inherit"),
    created_at_ts: integer("created_at_ts").notNull(),
    updated_at_ts: integer("updated_at_ts").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenant_id, table.id], name: "actions_pk" }),
    index("idx_actions_tenant_id").on(table.tenant_id),
    index("idx_actions_name").on(table.tenant_id, table.name),
  ],
);

export const actionVersions = sqliteTable(
  "action_versions",
  {
    id: text("id", { length: 255 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    action_id: text("action_id", { length: 255 }).notNull(),
    number: integer("number").notNull(),
    code: text("code").notNull(),
    runtime: text("runtime", { length: 50 }),
    secrets: text("secrets"),
    dependencies: text("dependencies"),
    supported_triggers: text("supported_triggers"),
    deployed: integer("deployed").notNull(),
    created_at_ts: integer("created_at_ts").notNull(),
    updated_at_ts: integer("updated_at_ts").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.id],
      name: "action_versions_pk",
    }),
    // Serializes concurrent creates and enforces sequential version numbers
    // per action, mirroring the kysely unique index.
    uniqueIndex("uq_action_versions_number").on(
      table.tenant_id,
      table.action_id,
      table.number,
    ),
    index("idx_action_versions_action_id").on(
      table.tenant_id,
      table.action_id,
    ),
  ],
);

export const actionExecutions = sqliteTable(
  "action_executions",
  {
    id: text("id", { length: 255 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    trigger_id: text("trigger_id", { length: 255 }).notNull(),
    status: text("status", { length: 32 }).notNull(),
    results: text("results").notNull(),
    logs: text("logs"),
    created_at_ts: integer("created_at_ts").notNull(),
    updated_at_ts: integer("updated_at_ts").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.id],
      name: "action_executions_pk",
    }),
  ],
);
