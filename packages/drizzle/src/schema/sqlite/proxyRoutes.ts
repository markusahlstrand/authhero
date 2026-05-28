import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const proxyRoutes = sqliteTable(
  "proxy_routes",
  {
    id: text("id", { length: 64 }).primaryKey(),
    tenant_id: text("tenant_id", { length: 255 }).notNull(),
    custom_domain_id: text("custom_domain_id", { length: 256 }).notNull(),
    priority: integer("priority").notNull().default(100),
    match: text("match", { length: 2048 }).notNull().default('{"path":"/*"}'),
    handlers: text("handlers", { length: 16384 }).notNull().default("[]"),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
  },
  (table) => [
    index("proxy_routes_tenant_id_idx").on(table.tenant_id),
    index("proxy_routes_custom_domain_id_idx").on(table.custom_domain_id),
  ],
);
