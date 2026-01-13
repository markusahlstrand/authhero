import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";

export const connections = sqliteTable(
  "connections",
  {
    id: text("id", { length: 255 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name", { length: 255 }).notNull(),
    response_type: text("response_type", { length: 255 }),
    response_mode: text("response_mode", { length: 255 }),
    strategy: text("strategy", { length: 64 }),
    options: text("options", { length: 8192 }).notNull().default("{}"),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
    display_name: text("display_name", { length: 255 }),
    is_domain_connection: integer("is_domain_connection"),
    show_as_button: integer("show_as_button"),
    is_system: integer("is_system").notNull().default(0),
    metadata: text("metadata", { length: 4096 }),
  },
  (table) => [
    primaryKey({ columns: [table.tenant_id, table.id] }),
    index("connections_tenant_id_index").on(table.tenant_id),
    // Required for keys.connection foreign key reference
    uniqueIndex("connections_id_unique").on(table.id),
  ],
);

export const customDomains = sqliteTable("custom_domains", {
  custom_domain_id: text("custom_domain_id", { length: 256 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  domain: text("domain", { length: 255 }).notNull(),
  primary: integer("primary", { mode: "boolean" }).notNull(),
  status: text("status", { length: 50 }).notNull(),
  type: text("type", { length: 50 }).notNull(),
  origin_domain_name: text("origin_domain_name", { length: 255 }),
  verification: text("verification", { length: 2048 }),
  custom_client_ip_header: text("custom_client_ip_header", { length: 50 }),
  tls_policy: text("tls_policy", { length: 50 }),
  domain_metadata: text("domain_metadata", { length: 2048 }),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
});

export const domains = sqliteTable("domains", {
  id: text("id", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  domain: text("domain", { length: 255 }).notNull(),
  email_service: text("email_service", { length: 255 }),
  email_api_key: text("email_api_key", { length: 255 }),
  dkim_private_key: text("dkim_private_key", { length: 2048 }),
  dkim_public_key: text("dkim_public_key", { length: 2048 }),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
});
