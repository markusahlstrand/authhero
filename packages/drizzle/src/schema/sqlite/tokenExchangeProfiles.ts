import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Custom Token Exchange profiles (#1417). The unique (tenant_id,
// subject_token_type) index makes a subject_token_type resolve to a single
// profile; a duplicate create surfaces as a constraint error (409 upstream).
export const tokenExchangeProfiles = sqliteTable(
  "token_exchange_profiles",
  {
    id: text("id", { length: 64 }).primaryKey(),
    tenant_id: text("tenant_id", { length: 255 }).notNull(),
    name: text("name", { length: 255 }).notNull(),
    subject_token_type: text("subject_token_type", { length: 255 }).notNull(),
    action_id: text("action_id", { length: 255 }),
    type: text("type", { length: 64 }).notNull(),
    jwt_verification: text("jwt_verification"),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
  },
  (table) => [
    uniqueIndex("token_exchange_profiles_tenant_subject_token_type_idx").on(
      table.tenant_id,
      table.subject_token_type,
    ),
  ],
);
