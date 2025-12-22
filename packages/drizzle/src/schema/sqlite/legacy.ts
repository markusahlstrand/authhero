import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";

export const members = sqliteTable("members", {
  id: text("id", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  sub: text("sub", { length: 255 }),
  email: text("email", { length: 255 }),
  name: text("name", { length: 255 }),
  status: text("status", { length: 255 }),
  role: text("role", { length: 255 }),
  picture: text("picture", { length: 2083 }),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
});

// Legacy applications table (for migrations)
export const applications = sqliteTable("applications", {
  id: text("id", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name", { length: 255 }).notNull(),
  client_secret: text("client_secret", { length: 255 }),
  allowed_logout_urls: text("allowed_logout_urls", { length: 255 }),
  authentication_settings: text("authentication_settings", { length: 255 }),
  addons: text("addons", { length: 4096 }).notNull().default("{}"),
  callbacks: text("callbacks", { length: 1024 }).notNull().default("[]"),
  allowed_origins: text("allowed_origins", { length: 1024 }).notNull().default("[]"),
  web_origins: text("web_origins", { length: 1024 }).notNull().default("[]"),
  allowed_clients: text("allowed_clients", { length: 1024 }).notNull().default("[]"),
  options_kid: text("options_kid", { length: 32 }),
  options_team_id: text("options_team_id", { length: 32 }),
  options_client_id: text("options_client_id", { length: 128 }),
  options_client_secret: text("options_client_secret", { length: 255 }),
  options_scope: text("options_scope", { length: 255 }),
  options_realms: text("options_realms", { length: 255 }),
  options_app_secret: text("options_app_secret", { length: 1024 }),
  email_validation: text("email_validation", { length: 255 }),
  disable_sign_ups: text("disable_sign_ups"), // stored as boolean but varies
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
});

// Legacy migrations table (for data migrations)
export const migrations = sqliteTable("migrations", {
  id: text("id", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: text("provider", { length: 255 }),
  client_id: text("client_id", { length: 255 }),
  origin: text("origin", { length: 255 }),
  domain: text("domain", { length: 255 }),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
});

// Legacy logins table
export const logins = sqliteTable("logins", {
  login_id: text("login_id", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  authParams_client_id: text("authParams_client_id", { length: 255 }).notNull(),
  authParams_vendor_id: text("authParams_vendor_id", { length: 255 }),
  authParams_username: text("authParams_username", { length: 255 }),
  authParams_response_type: text("authParams_response_type", { length: 255 }),
  authParams_response_mode: text("authParams_response_mode", { length: 255 }),
  authParams_audience: text("authParams_audience", { length: 255 }),
  authParams_scope: text("authParams_scope", { length: 511 }),
  authParams_state: text("authParams_state", { length: 511 }),
  authParams_code_challenge_method: text("authParams_code_challenge_method", { length: 256 }),
  authParams_code_challenge: text("authParams_code_challenge", { length: 256 }),
  authParams_redirect_uri: text("authParams_redirect_uri", { length: 256 }),
  authParams_organization: text("authParams_organization", { length: 256 }),
  authorization_url: text("authorization_url", { length: 1024 }),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
  expires_at: text("expires_at", { length: 255 }).notNull(),
  ip: text("ip", { length: 255 }),
  useragent: text("useragent", { length: 512 }),
  auth0Client: text("auth0Client", { length: 256 }),
  authParams_nonce: text("authParams_nonce", { length: 255 }),
  authParams_ui_locales: text("authParams_ui_locales", { length: 32 }),
  authParams_prompt: text("authParams_prompt", { length: 16 }),
  authParams_act_as: text("authParams_act_as", { length: 255 }),
});
