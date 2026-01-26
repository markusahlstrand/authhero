import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";

export const users = sqliteTable(
  "users",
  {
    user_id: text("user_id", { length: 255 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email", { length: 255 }),
    given_name: text("given_name", { length: 255 }),
    family_name: text("family_name", { length: 255 }),
    nickname: text("nickname", { length: 255 }),
    name: text("name", { length: 255 }),
    picture: text("picture", { length: 2083 }),
    tags: text("tags", { length: 255 }),
    phone_number: text("phone_number", { length: 17 }),
    phone_verified: integer("phone_verified", { mode: "boolean" }),
    username: text("username", { length: 128 }),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
    linked_to: text("linked_to", { length: 255 }),
    last_ip: text("last_ip", { length: 255 }),
    login_count: integer("login_count").notNull(),
    last_login: text("last_login", { length: 255 }),
    provider: text("provider", { length: 255 }).notNull(),
    connection: text("connection", { length: 255 }),
    email_verified: integer("email_verified", { mode: "boolean" }).notNull(),
    is_social: integer("is_social", { mode: "boolean" }).notNull(),
    app_metadata: text("app_metadata", { length: 4096 })
      .notNull()
      .default("{}"),
    user_metadata: text("user_metadata").notNull().default("{}"),
    profileData: text("profileData", { length: 2048 }),
    locale: text("locale", { length: 255 }),
    // Additional OIDC profile claims (OIDC Core 5.1)
    middle_name: text("middle_name", { length: 100 }),
    preferred_username: text("preferred_username", { length: 255 }), // Shorthand name user wishes to be referred to
    profile: text("profile"), // URL of profile page
    website: text("website"),
    gender: text("gender", { length: 50 }),
    birthdate: text("birthdate", { length: 10 }), // ISO 8601:2004 YYYY-MM-DD
    zoneinfo: text("zoneinfo", { length: 100 }), // e.g., "Europe/Paris"
  },
  (table) => [
    primaryKey({
      columns: [table.user_id, table.tenant_id],
      name: "users_tenants",
    }),
    uniqueIndex("unique_email_provider").on(
      table.email,
      table.provider,
      table.tenant_id,
    ),
    uniqueIndex("unique_phone_provider").on(
      table.phone_number,
      table.provider,
      table.tenant_id,
    ),
    index("users_email_index").on(table.email),
    index("users_linked_to_index").on(table.linked_to),
    index("users_name_index").on(table.name),
    index("users_phone_tenant_provider_index").on(
      table.tenant_id,
      table.phone_number,
      table.provider,
    ),
  ],
);

export const passwords = sqliteTable("passwords", {
  id: text("id", { length: 21 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  user_id: text("user_id", { length: 255 }).notNull(),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
  password: text("password", { length: 255 }).notNull(),
  algorithm: text("algorithm", { length: 16 }).notNull().default("bcrypt"),
  is_current: integer("is_current").notNull().default(1),
});
