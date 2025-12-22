import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

export const roles = sqliteTable("roles", {
  id: text("id", { length: 21 }).notNull(),
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  name: text("name", { length: 50 }).notNull(),
  description: text("description", { length: 255 }),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.id], name: "roles_pk" }),
]);

export const rolePermissions = sqliteTable("role_permissions", {
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  role_id: text("role_id", { length: 21 }).notNull(),
  resource_server_identifier: text("resource_server_identifier", { length: 191 }).notNull(),
  permission_name: text("permission_name", { length: 191 }).notNull(),
  created_at: text("created_at", { length: 35 }).notNull(),
}, (table) => [
  primaryKey({ 
    columns: [table.tenant_id, table.role_id, table.resource_server_identifier, table.permission_name], 
    name: "role_permissions_pk" 
  }),
  index("role_permissions_role_fk").on(table.tenant_id, table.role_id),
  index("role_permissions_permission_fk").on(table.tenant_id, table.resource_server_identifier, table.permission_name),
]);

export const userPermissions = sqliteTable("user_permissions", {
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  user_id: text("user_id", { length: 191 }).notNull(),
  resource_server_identifier: text("resource_server_identifier", { length: 21 }).notNull(),
  permission_name: text("permission_name", { length: 191 }).notNull(),
  organization_id: text("organization_id", { length: 21 }).notNull().default(""),
  created_at: text("created_at", { length: 35 }).notNull(),
}, (table) => [
  primaryKey({ 
    columns: [table.tenant_id, table.user_id, table.resource_server_identifier, table.permission_name, table.organization_id], 
    name: "user_permissions_pk" 
  }),
  index("user_permissions_user_fk").on(table.tenant_id, table.user_id),
  index("user_permissions_permission_fk").on(table.tenant_id, table.resource_server_identifier, table.permission_name),
  index("user_permissions_organization_fk").on(table.organization_id),
]);

export const userRoles = sqliteTable("user_roles", {
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  user_id: text("user_id", { length: 191 }).notNull(),
  role_id: text("role_id", { length: 21 }).notNull(),
  organization_id: text("organization_id", { length: 191 }).notNull().default(""),
  created_at: text("created_at", { length: 35 }).notNull(),
}, (table) => [
  primaryKey({ 
    columns: [table.tenant_id, table.user_id, table.role_id, table.organization_id], 
    name: "user_roles_pk" 
  }),
  index("user_roles_user_fk").on(table.tenant_id, table.user_id),
  index("user_roles_role_fk").on(table.tenant_id, table.role_id),
  index("user_roles_organization_fk").on(table.organization_id),
]);

export const resourceServers = sqliteTable("resource_servers", {
  id: text("id", { length: 21 }).notNull(),
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  identifier: text("identifier", { length: 191 }).notNull(),
  name: text("name", { length: 255 }).notNull(),
  scopes: text("scopes", { length: 4096 }),
  signing_alg: text("signing_alg", { length: 64 }),
  signing_secret: text("signing_secret", { length: 2048 }),
  token_lifetime: integer("token_lifetime"),
  token_lifetime_for_web: integer("token_lifetime_for_web"),
  skip_consent_for_verifiable_first_party_clients: integer("skip_consent_for_verifiable_first_party_clients"),
  allow_offline_access: integer("allow_offline_access"),
  verification_key: text("verification_key", { length: 4096 }),
  options: text("options", { length: 4096 }),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.id], name: "resource_servers_pk" }),
]);
