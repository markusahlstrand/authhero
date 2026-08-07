import {
  sqliteTable,
  text,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// One SCIM configuration per connection (SCIM inbound provisioning, #1191).
// Every key here leads with tenant_id: connection ids are only unique within a
// tenant, so a tenant-less key would let one tenant's connection block
// another's — and the composite PK doubles as the tenant-scoped uniqueness
// constraint the create path relies on.
export const scimConfigurations = sqliteTable(
  "scim_configurations",
  {
    connection_id: text("connection_id", { length: 255 }).notNull(),
    tenant_id: text("tenant_id", { length: 255 }).notNull(),
    user_id_attribute: text("user_id_attribute", { length: 255 })
      .notNull()
      .default("externalId"),
    mapping: text("mapping", { length: 16384 }).notNull().default("[]"),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenant_id, table.connection_id] })],
);

// Hashed long-lived bearer tokens used by IdPs to authenticate to /scim/v2.
export const scimTokens = sqliteTable(
  "scim_tokens",
  {
    token_id: text("token_id", { length: 64 }).notNull(),
    tenant_id: text("tenant_id", { length: 255 }).notNull(),
    connection_id: text("connection_id", { length: 255 }).notNull(),
    token_hash: text("token_hash", { length: 128 }).notNull(),
    scopes: text("scopes", { length: 4096 }).notNull().default("[]"),
    valid_until: text("valid_until", { length: 35 }),
    created_at: text("created_at", { length: 35 }).notNull(),
    last_used_at: text("last_used_at", { length: 35 }),
  },
  (table) => [
    primaryKey({ columns: [table.tenant_id, table.token_id] }),
    index("scim_tokens_tenant_connection_idx").on(
      table.tenant_id,
      table.connection_id,
    ),
    // Authentication resolves a token by hash, and a hash must identify at
    // most one token within the tenant.
    uniqueIndex("scim_tokens_tenant_hash_idx").on(
      table.tenant_id,
      table.token_hash,
    ),
  ],
);

// Maps an IdP-assigned externalId to an AuthHero user_id, scoped to a
// connection. Queried both by externalId (IdP lookup before create) and by
// user_id (to emit externalId on reads).
export const scimExternalIds = sqliteTable(
  "scim_external_ids",
  {
    tenant_id: text("tenant_id", { length: 255 }).notNull(),
    connection_id: text("connection_id", { length: 255 }).notNull(),
    external_id: text("external_id", { length: 255 }).notNull(),
    user_id: text("user_id", { length: 255 }).notNull(),
    created_at: text("created_at", { length: 35 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.connection_id, table.user_id],
    }),
    uniqueIndex("scim_external_ids_connection_external_idx").on(
      table.tenant_id,
      table.connection_id,
      table.external_id,
    ),
  ],
);
