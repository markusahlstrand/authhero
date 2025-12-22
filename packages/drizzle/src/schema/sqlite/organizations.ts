import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: text("id", { length: 21 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  name: text("name", { length: 256 }).notNull(),
  display_name: text("display_name", { length: 256 }),
  branding: text("branding"),
  metadata: text("metadata"),
  enabled_connections: text("enabled_connections"),
  token_quota: text("token_quota"),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
}, (table) => [
  index("idx_organizations_tenant_id").on(table.tenant_id),
]);

export const userOrganizations = sqliteTable("user_organizations", {
  id: text("id", { length: 21 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  user_id: text("user_id", { length: 191 }).notNull(),
  organization_id: text("organization_id", { length: 21 }).notNull(),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
}, (table) => [
  uniqueIndex("user_organizations_unique").on(table.tenant_id, table.user_id, table.organization_id),
  index("idx_user_organizations_tenant_id").on(table.tenant_id),
  index("idx_user_organizations_user_id").on(table.user_id),
  index("idx_user_organizations_organization_id").on(table.organization_id),
]);

export const invites = sqliteTable("invites", {
  id: text("id", { length: 21 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  organization_id: text("organization_id", { length: 21 }).notNull(),
  inviter: text("inviter").notNull(),
  invitee: text("invitee").notNull(),
  client_id: text("client_id", { length: 191 }).notNull(),
  connection_id: text("connection_id", { length: 21 }),
  invitation_url: text("invitation_url").notNull(),
  created_at: text("created_at", { length: 35 }).notNull(),
  expires_at: text("expires_at", { length: 35 }).notNull(),
  app_metadata: text("app_metadata"),
  user_metadata: text("user_metadata"),
  roles: text("roles"),
  ticket_id: text("ticket_id", { length: 191 }),
  ttl_sec: integer("ttl_sec"),
  send_invitation_email: integer("send_invitation_email"),
}, (table) => [
  index("idx_invites_tenant_id").on(table.tenant_id),
  index("idx_invites_organization_id").on(table.organization_id),
  index("idx_invites_expires_at").on(table.expires_at),
  index("idx_invites_tenant_created").on(table.tenant_id, table.created_at),
]);
