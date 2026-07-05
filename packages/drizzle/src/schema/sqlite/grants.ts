import {
  sqliteTable,
  text,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";
import { users } from "./users";

// Per-(user, client, audience) OAuth consent grants — the store behind the
// consent screen and the management API /grants endpoints. Mirrors the
// kysely `grants` table: audience defaults to "" so the natural-key unique
// index treats "no audience" as a single slot per (user, client).
export const grants = sqliteTable(
  "grants",
  {
    id: text("id", { length: 21 }).primaryKey(),
    tenant_id: text("tenant_id", { length: 255 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: text("user_id", { length: 255 }).notNull(),
    client_id: text("client_id", { length: 100 }).notNull(),
    audience: text("audience", { length: 100 }).notNull().default(""),
    scope: text("scope").notNull().default("[]"),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id, table.tenant_id],
      foreignColumns: [users.user_id, users.tenant_id],
      name: "grants_user_id_constraint",
    }).onDelete("cascade"),
    uniqueIndex("grants_natural_key_idx").on(
      table.tenant_id,
      table.user_id,
      table.client_id,
      table.audience,
    ),
    index("grants_tenant_user_idx").on(table.tenant_id, table.user_id),
  ],
);
