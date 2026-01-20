import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id", { length: 21 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: text("user_id", { length: 255 }),
    created_at_ts: integer("created_at_ts").notNull(),
    updated_at_ts: integer("updated_at_ts").notNull(),
    expires_at_ts: integer("expires_at_ts"),
    idle_expires_at_ts: integer("idle_expires_at_ts"),
    authenticated_at_ts: integer("authenticated_at_ts"),
    last_interaction_at_ts: integer("last_interaction_at_ts"),
    used_at_ts: integer("used_at_ts"),
    revoked_at_ts: integer("revoked_at_ts"),
    device: text("device").notNull(),
    clients: text("clients").notNull(),
    login_session_id: text("login_session_id", { length: 21 }),
  },
  (table) => [
    primaryKey({ columns: [table.tenant_id, table.id], name: "sessions_pk" }),
    index("IDX_sessions_login_session_id").on(table.login_session_id),
    index("idx_sessions_user_id").on(table.tenant_id, table.user_id),
    index("idx_sessions_expires_at_ts").on(table.expires_at_ts),
  ],
);

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: text("id", { length: 21 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    client_id: text("client_id", { length: 191 }).notNull(),
    session_id: text("session_id", { length: 21 }).notNull(),
    user_id: text("user_id", { length: 255 }),
    resource_servers: text("resource_servers").notNull(),
    device: text("device").notNull(),
    rotating: integer("rotating", { mode: "boolean" }).notNull(),
    created_at_ts: integer("created_at_ts").notNull(),
    expires_at_ts: integer("expires_at_ts"),
    idle_expires_at_ts: integer("idle_expires_at_ts"),
    last_exchanged_at_ts: integer("last_exchanged_at_ts"),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.id],
      name: "refresh_tokens_pk",
    }),
    index("idx_refresh_tokens_user_id").on(table.tenant_id, table.user_id),
    index("idx_refresh_tokens_session_id").on(table.session_id),
    index("idx_refresh_tokens_expires_at_ts").on(table.expires_at_ts),
  ],
);

export const loginSessions = sqliteTable(
  "login_sessions",
  {
    id: text("id", { length: 21 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    session_id: text("session_id", { length: 21 }),
    csrf_token: text("csrf_token", { length: 21 }).notNull(),
    authParams_client_id: text("authParams_client_id", {
      length: 191,
    }).notNull(),
    authParams_vendor_id: text("authParams_vendor_id", { length: 255 }),
    authParams_username: text("authParams_username", { length: 255 }),
    authParams_response_type: text("authParams_response_type", { length: 255 }),
    authParams_response_mode: text("authParams_response_mode", { length: 255 }),
    authParams_audience: text("authParams_audience", { length: 255 }),
    authParams_scope: text("authParams_scope"),
    authParams_state: text("authParams_state"),
    authParams_nonce: text("authParams_nonce", { length: 255 }),
    authParams_code_challenge_method: text("authParams_code_challenge_method", {
      length: 255,
    }),
    authParams_code_challenge: text("authParams_code_challenge", {
      length: 255,
    }),
    authParams_redirect_uri: text("authParams_redirect_uri"),
    authParams_organization: text("authParams_organization", { length: 255 }),
    authParams_prompt: text("authParams_prompt", { length: 32 }),
    authParams_act_as: text("authParams_act_as", { length: 256 }),
    authParams_ui_locales: text("authParams_ui_locales", { length: 32 }),
    authorization_url: text("authorization_url"),
    created_at_ts: integer("created_at_ts").notNull(),
    updated_at_ts: integer("updated_at_ts").notNull(),
    expires_at_ts: integer("expires_at_ts").notNull(),
    ip: text("ip", { length: 39 }),
    useragent: text("useragent"),
    auth0Client: text("auth0Client", { length: 255 }),
    state: text("state", { length: 50 }).notNull().default("pending"),
    state_data: text("state_data"), // JSON: { hookId?, continuationScope?, continuationReturnUrl? }
    failure_reason: text("failure_reason"),
    user_id: text("user_id", { length: 255 }),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.id],
      name: "login_sessions_pk",
    }),
    index("login_sessions_id_index").on(table.id),
    index("login_sessions_state_idx").on(table.state),
    index("login_sessions_state_updated_idx").on(table.state, table.updated_at_ts),
    index("login_sessions_tenant_user_idx").on(table.tenant_id, table.user_id),
    index("idx_login_sessions_expires_at_ts").on(table.expires_at_ts),
  ],
);

export const codes = sqliteTable(
  "codes",
  {
    code_id: text("code_id", { length: 191 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: text("user_id", { length: 255 }),
    login_id: text("login_id", { length: 255 }),
    connection_id: text("connection_id", { length: 255 }),
    code_type: text("code_type", { length: 255 }).notNull(),
    created_at: text("created_at", { length: 35 }).notNull(),
    expires_at: text("expires_at", { length: 35 }).notNull(),
    used_at: text("used_at", { length: 35 }),
    code_verifier: text("code_verifier", { length: 128 }),
    code_challenge: text("code_challenge", { length: 128 }),
    code_challenge_method: text("code_challenge_method", { length: 5 }),
    redirect_uri: text("redirect_uri", { length: 1024 }),
    nonce: text("nonce", { length: 1024 }),
    state: text("state", { length: 2048 }),
  },
  (table) => [
    primaryKey({
      columns: [table.code_id, table.code_type],
      name: "PK_codes_code_id_code_type",
    }),
    index("codes_expires_at_index").on(table.expires_at),
  ],
);

export const authenticationCodes = sqliteTable("authentication_codes", {
  tenant_id: text("tenant_id", { length: 191 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code", { length: 255 }).primaryKey(),
  client_id: text("client_id", { length: 255 }).notNull(),
  user_id: text("user_id", { length: 255 }).notNull(),
  nonce: text("nonce", { length: 255 }),
  state: text("state", { length: 8192 }),
  scope: text("scope", { length: 1024 }),
  response_type: text("response_type", { length: 256 }),
  response_mode: text("response_mode", { length: 256 }),
  redirect_uri: text("redirect_uri", { length: 1024 }),
  created_at: text("created_at", { length: 35 }).notNull(),
  expires_at: text("expires_at", { length: 35 }).notNull(),
  used_at: text("used_at", { length: 35 }),
});

export const otps = sqliteTable(
  "otps",
  {
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    id: text("id", { length: 255 }).primaryKey(),
    client_id: text("client_id", { length: 255 }).notNull(),
    code: text("code", { length: 255 }).notNull(),
    email: text("email", { length: 255 }).notNull(),
    user_id: text("user_id", { length: 255 }),
    send: text("send", { length: 255 }),
    nonce: text("nonce", { length: 255 }),
    state: text("state", { length: 1024 }),
    scope: text("scope", { length: 1024 }),
    response_type: text("response_type", { length: 256 }),
    response_mode: text("response_mode", { length: 256 }),
    redirect_uri: text("redirect_uri", { length: 1024 }),
    created_at: text("created_at", { length: 35 }).notNull(),
    expires_at: text("expires_at", { length: 35 }).notNull(),
    used_at: text("used_at", { length: 35 }),
    audience: text("audience", { length: 255 }),
    ip: text("ip", { length: 64 }),
  },
  (table) => [
    index("otps_email_index").on(table.email),
    index("otps_expires_at_index").on(table.expires_at),
  ],
);

export const tickets = sqliteTable("tickets", {
  tenant_id: text("tenant_id", { length: 191 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  id: text("id", { length: 255 }).primaryKey(),
  client_id: text("client_id", { length: 255 }).notNull(),
  email: text("email", { length: 255 }).notNull(),
  nonce: text("nonce", { length: 255 }),
  state: text("state", { length: 1024 }),
  scope: text("scope", { length: 1024 }),
  response_type: text("response_type", { length: 256 }),
  response_mode: text("response_mode", { length: 256 }),
  redirect_uri: text("redirect_uri", { length: 1024 }),
  created_at: text("created_at", { length: 35 }).notNull(),
  expires_at: text("expires_at", { length: 35 }).notNull(),
  used_at: text("used_at", { length: 35 }),
});
