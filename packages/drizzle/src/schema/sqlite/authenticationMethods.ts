import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";

export const authenticationMethods = sqliteTable(
  "authentication_methods",
  {
    id: text("id", { length: 26 }).primaryKey(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: text("user_id", { length: 255 }).notNull(),
    type: text("type", { length: 32 }).notNull(),
    phone_number: text("phone_number", { length: 32 }),
    totp_secret: text("totp_secret", { length: 255 }),
    credential_id: text("credential_id", { length: 512 }),
    public_key: text("public_key"),
    sign_count: integer("sign_count"),
    credential_backed_up: integer("credential_backed_up"),
    transports: text("transports", { length: 512 }),
    friendly_name: text("friendly_name", { length: 255 }),
    confirmed: integer("confirmed").notNull().default(0),
    created_at_ts: integer("created_at_ts").notNull(),
    updated_at_ts: integer("updated_at_ts").notNull(),
  },
  (table) => [
    index("authentication_methods_tenant_user_idx").on(
      table.tenant_id,
      table.user_id,
    ),
    index("authentication_methods_credential_id_idx").on(table.credential_id),
  ],
);
