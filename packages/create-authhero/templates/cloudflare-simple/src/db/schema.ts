/**
 * AuthHero Database Schema for Cloudflare D1
 * 
 * This schema is used by Drizzle Kit to generate migrations.
 * Runtime queries use the @authhero/kysely-adapter.
 * 
 * To add custom tables or modify the schema:
 * 1. Edit this file
 * 2. Run: npm run db:generate
 * 3. Run: npm run db:migrate:local (or db:migrate:remote)
 */

import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// ============================================================================
// TENANTS
// ============================================================================

export const tenants = sqliteTable("tenants", {
  id: text("id", { length: 255 }).primaryKey(),
  name: text("name", { length: 255 }),
  audience: text("audience", { length: 255 }),
  sender_email: text("sender_email", { length: 255 }),
  sender_name: text("sender_name", { length: 255 }),
  language: text("language", { length: 255 }),
  logo: text("logo", { length: 255 }),
  primary_color: text("primary_color", { length: 255 }),
  secondary_color: text("secondary_color", { length: 255 }),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
  support_url: text("support_url", { length: 255 }),
  idle_session_lifetime: integer("idle_session_lifetime"),
  session_lifetime: integer("session_lifetime"),
  session_cookie: text("session_cookie"),
  allowed_logout_urls: text("allowed_logout_urls"),
  ephemeral_session_lifetime: integer("ephemeral_session_lifetime"),
  idle_ephemeral_session_lifetime: integer("idle_ephemeral_session_lifetime"),
  default_redirection_uri: text("default_redirection_uri"),
  enabled_locales: text("enabled_locales"),
  default_directory: text("default_directory", { length: 255 }),
  error_page: text("error_page"),
  flags: text("flags"),
  friendly_name: text("friendly_name", { length: 255 }),
  picture_url: text("picture_url"),
  support_email: text("support_email", { length: 255 }),
  sandbox_version: text("sandbox_version", { length: 50 }),
  sandbox_versions_available: text("sandbox_versions_available"),
  legacy_sandbox_version: text("legacy_sandbox_version", { length: 50 }),
  change_password: text("change_password"),
  guardian_mfa_page: text("guardian_mfa_page"),
  device_flow: text("device_flow"),
  default_token_quota: text("default_token_quota"),
  default_audience: text("default_audience", { length: 255 }),
  default_organization: text("default_organization", { length: 255 }),
  sessions: text("sessions"),
  oidc_logout: text("oidc_logout"),
  allow_organization_name_in_authentication_api: integer("allow_organization_name_in_authentication_api"),
  customize_mfa_in_postlogin_action: integer("customize_mfa_in_postlogin_action"),
  acr_values_supported: text("acr_values_supported"),
  mtls: text("mtls"),
  pushed_authorization_requests_supported: integer("pushed_authorization_requests_supported"),
  authorization_response_iss_parameter_supported: integer("authorization_response_iss_parameter_supported"),
});

// ============================================================================
// USERS
// ============================================================================

export const users = sqliteTable("users", {
  user_id: text("user_id", { length: 255 }).notNull(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
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
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
  linked_to: text("linked_to", { length: 255 }),
  last_ip: text("last_ip", { length: 255 }),
  login_count: integer("login_count").notNull(),
  last_login: text("last_login", { length: 255 }),
  provider: text("provider", { length: 255 }).notNull(),
  connection: text("connection", { length: 255 }),
  email_verified: integer("email_verified", { mode: "boolean" }).notNull(),
  is_social: integer("is_social", { mode: "boolean" }).notNull(),
  app_metadata: text("app_metadata", { length: 4096 }).notNull().default("{}"),
  user_metadata: text("user_metadata", { length: 4096 }).notNull().default("{}"),
  profileData: text("profileData", { length: 2048 }),
  locale: text("locale", { length: 255 }),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.tenant_id], name: "users_tenants" }),
  uniqueIndex("unique_email_provider").on(table.email, table.provider, table.tenant_id),
  uniqueIndex("unique_phone_provider").on(table.phone_number, table.provider, table.tenant_id),
  index("users_email_index").on(table.email),
  index("users_linked_to_index").on(table.linked_to),
  index("users_name_index").on(table.name),
  index("users_phone_tenant_provider_index").on(table.tenant_id, table.phone_number, table.provider),
]);

export const passwords = sqliteTable("passwords", {
  id: text("id", { length: 21 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).notNull(),
  user_id: text("user_id", { length: 255 }).notNull(),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
  password: text("password", { length: 255 }).notNull(),
  algorithm: text("algorithm", { length: 16 }).notNull().default("bcrypt"),
  is_current: integer("is_current").notNull().default(1),
});

export const passwordHistory = sqliteTable("password_history", {
  id: text("id", { length: 21 }).primaryKey(),
  user_id: text("user_id", { length: 191 }).notNull(),
  tenant_id: text("tenant_id", { length: 191 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  password: text("password", { length: 255 }).notNull(),
  algorithm: text("algorithm", { length: 255 }).notNull().default("bcrypt"),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
  is_current: integer("is_current").notNull().default(1),
});

// ============================================================================
// CLIENTS
// ============================================================================

export const clients = sqliteTable("clients", {
  client_id: text("client_id", { length: 191 }).notNull(),
  tenant_id: text("tenant_id", { length: 191 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name", { length: 255 }).notNull(),
  description: text("description", { length: 140 }),
  global: integer("global").notNull().default(0),
  client_secret: text("client_secret", { length: 255 }),
  app_type: text("app_type", { length: 64 }).default("regular_web"),
  logo_uri: text("logo_uri", { length: 2083 }),
  is_first_party: integer("is_first_party").notNull().default(0),
  oidc_conformant: integer("oidc_conformant").notNull().default(1),
  callbacks: text("callbacks").notNull(),
  allowed_origins: text("allowed_origins").notNull(),
  web_origins: text("web_origins").notNull(),
  client_aliases: text("client_aliases").notNull(),
  allowed_clients: text("allowed_clients").notNull(),
  allowed_logout_urls: text("allowed_logout_urls").notNull(),
  session_transfer: text("session_transfer").notNull(),
  oidc_logout: text("oidc_logout").notNull(),
  grant_types: text("grant_types").notNull(),
  jwt_configuration: text("jwt_configuration").notNull(),
  signing_keys: text("signing_keys").notNull(),
  encryption_key: text("encryption_key").notNull(),
  sso: integer("sso").notNull().default(0),
  sso_disabled: integer("sso_disabled").notNull().default(1),
  cross_origin_authentication: integer("cross_origin_authentication").notNull().default(0),
  cross_origin_loc: text("cross_origin_loc", { length: 2083 }),
  custom_login_page_on: integer("custom_login_page_on").notNull().default(0),
  custom_login_page: text("custom_login_page"),
  custom_login_page_preview: text("custom_login_page_preview"),
  form_template: text("form_template"),
  addons: text("addons").notNull(),
  token_endpoint_auth_method: text("token_endpoint_auth_method", { length: 64 }).default("client_secret_basic"),
  client_metadata: text("client_metadata").notNull(),
  mobile: text("mobile").notNull(),
  initiate_login_uri: text("initiate_login_uri", { length: 2083 }),
  native_social_login: text("native_social_login").notNull(),
  refresh_token: text("refresh_token").notNull(),
  default_organization: text("default_organization").notNull(),
  organization_usage: text("organization_usage", { length: 32 }).default("deny"),
  organization_require_behavior: text("organization_require_behavior", { length: 32 }).default("no_prompt"),
  client_authentication_methods: text("client_authentication_methods").notNull(),
  require_pushed_authorization_requests: integer("require_pushed_authorization_requests").notNull().default(0),
  require_proof_of_possession: integer("require_proof_of_possession").notNull().default(0),
  signed_request_object: text("signed_request_object").notNull(),
  compliance_level: text("compliance_level", { length: 64 }),
  par_request_expiry: integer("par_request_expiry"),
  token_quota: text("token_quota").notNull(),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
  connections: text("connections").notNull().default("[]"),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.client_id], name: "clients_tenant_id_client_id" }),
]);

export const clientGrants = sqliteTable("client_grants", {
  id: text("id", { length: 21 }).notNull(),
  tenant_id: text("tenant_id", { length: 191 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  client_id: text("client_id", { length: 191 }).notNull(),
  audience: text("audience", { length: 191 }).notNull(),
  scope: text("scope").default("[]"),
  organization_usage: text("organization_usage", { length: 32 }),
  allow_any_organization: integer("allow_any_organization").default(0),
  is_system: integer("is_system").default(0),
  subject_type: text("subject_type", { length: 32 }),
  authorization_details_types: text("authorization_details_types").default("[]"),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.id], name: "pk_client_grants" }),
  index("idx_client_grants_audience").on(table.audience),
]);

// ============================================================================
// CONNECTIONS
// ============================================================================

export const connections = sqliteTable("connections", {
  id: text("id", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name", { length: 255 }).notNull(),
  response_type: text("response_type", { length: 255 }),
  response_mode: text("response_mode", { length: 255 }),
  strategy: text("strategy", { length: 64 }),
  options: text("options", { length: 2048 }).notNull().default("{}"),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
  display_name: text("display_name", { length: 255 }),
  is_domain_connection: integer("is_domain_connection"),
  show_as_button: integer("show_as_button"),
  metadata: text("metadata", { length: 4096 }),
}, (table) => [
  index("connections_tenant_id_index").on(table.tenant_id),
]);

// ============================================================================
// SESSIONS & TOKENS
// ============================================================================

export const sessions = sqliteTable("sessions", {
  id: text("id", { length: 21 }).notNull(),
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  user_id: text("user_id", { length: 255 }),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
  expires_at: text("expires_at", { length: 35 }),
  idle_expires_at: text("idle_expires_at", { length: 35 }),
  authenticated_at: text("authenticated_at", { length: 35 }),
  last_interaction_at: text("last_interaction_at", { length: 35 }),
  used_at: text("used_at", { length: 35 }),
  revoked_at: text("revoked_at", { length: 35 }),
  device: text("device").notNull(),
  clients: text("clients").notNull(),
  login_session_id: text("login_session_id", { length: 21 }),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.id], name: "sessions_pk" }),
  index("IDX_sessions_login_session_id").on(table.login_session_id),
]);

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id", { length: 21 }).notNull(),
  tenant_id: text("tenant_id", { length: 255 }).notNull(),
  client_id: text("client_id", { length: 191 }).notNull(),
  session_id: text("session_id", { length: 21 }).notNull(),
  user_id: text("user_id", { length: 255 }),
  resource_servers: text("resource_servers").notNull(),
  device: text("device").notNull(),
  rotating: integer("rotating", { mode: "boolean" }).notNull(),
  created_at: text("created_at", { length: 35 }).notNull(),
  expires_at: text("expires_at", { length: 35 }),
  idle_expires_at: text("idle_expires_at", { length: 35 }),
  last_exchanged_at: text("last_exchanged_at", { length: 35 }),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.id], name: "refresh_tokens_pk" }),
]);

export const loginSessions = sqliteTable("login_sessions", {
  id: text("id", { length: 21 }).notNull(),
  tenant_id: text("tenant_id", { length: 255 }).notNull(),
  session_id: text("session_id", { length: 21 }),
  csrf_token: text("csrf_token", { length: 21 }).notNull(),
  authParams_client_id: text("authParams_client_id", { length: 191 }).notNull(),
  authParams_vendor_id: text("authParams_vendor_id", { length: 255 }),
  authParams_username: text("authParams_username", { length: 255 }),
  authParams_response_type: text("authParams_response_type", { length: 255 }),
  authParams_response_mode: text("authParams_response_mode", { length: 255 }),
  authParams_audience: text("authParams_audience", { length: 255 }),
  authParams_scope: text("authParams_scope"),
  authParams_state: text("authParams_state"),
  authParams_nonce: text("authParams_nonce", { length: 255 }),
  authParams_code_challenge_method: text("authParams_code_challenge_method", { length: 255 }),
  authParams_code_challenge: text("authParams_code_challenge", { length: 255 }),
  authParams_redirect_uri: text("authParams_redirect_uri"),
  authParams_organization: text("authParams_organization", { length: 255 }),
  authParams_prompt: text("authParams_prompt", { length: 32 }),
  authParams_act_as: text("authParams_act_as", { length: 256 }),
  authParams_ui_locales: text("authParams_ui_locales", { length: 32 }),
  authorization_url: text("authorization_url"),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
  expires_at: text("expires_at", { length: 35 }).notNull(),
  ip: text("ip", { length: 39 }),
  useragent: text("useragent"),
  auth0Client: text("auth0Client", { length: 255 }),
  login_completed: integer("login_completed").default(0),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.id], name: "login_sessions_pk" }),
  index("login_sessions_id_index").on(table.id),
]);

export const codes = sqliteTable("codes", {
  code_id: text("code_id", { length: 255 }).notNull(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  user_id: text("user_id", { length: 255 }),
  login_id: text("login_id", { length: 255 }),
  connection_id: text("connection_id", { length: 255 }),
  code_type: text("code_type", { length: 255 }).notNull(),
  created_at: text("created_at", { length: 255 }).notNull(),
  expires_at: text("expires_at", { length: 255 }).notNull(),
  used_at: text("used_at", { length: 255 }),
  code_verifier: text("code_verifier", { length: 128 }),
  code_challenge: text("code_challenge", { length: 128 }),
  code_challenge_method: text("code_challenge_method", { length: 5 }),
  redirect_uri: text("redirect_uri", { length: 1024 }),
  nonce: text("nonce", { length: 1024 }),
  state: text("state", { length: 2048 }),
}, (table) => [
  primaryKey({ columns: [table.code_id, table.code_type], name: "PK_codes_code_id_code_type" }),
  index("codes_expires_at_index").on(table.expires_at),
]);

export const authenticationCodes = sqliteTable("authentication_codes", {
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code", { length: 255 }).primaryKey(),
  client_id: text("client_id", { length: 255 }).notNull(),
  user_id: text("user_id", { length: 255 }).notNull(),
  nonce: text("nonce", { length: 255 }),
  state: text("state", { length: 8192 }),
  scope: text("scope", { length: 1024 }),
  response_type: text("response_type", { length: 256 }),
  response_mode: text("response_mode", { length: 256 }),
  redirect_uri: text("redirect_uri", { length: 1024 }),
  created_at: text("created_at", { length: 255 }).notNull(),
  expires_at: text("expires_at", { length: 255 }).notNull(),
  used_at: text("used_at", { length: 255 }),
});

export const otps = sqliteTable("otps", {
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
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
  created_at: text("created_at", { length: 255 }).notNull(),
  expires_at: text("expires_at", { length: 255 }).notNull(),
  used_at: text("used_at", { length: 255 }),
  audience: text("audience", { length: 255 }),
  ip: text("ip", { length: 64 }),
}, (table) => [
  index("otps_email_index").on(table.email),
  index("otps_expires_at_index").on(table.expires_at),
]);

export const tickets = sqliteTable("tickets", {
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  id: text("id", { length: 255 }).primaryKey(),
  client_id: text("client_id", { length: 255 }).notNull(),
  email: text("email", { length: 255 }).notNull(),
  nonce: text("nonce", { length: 255 }),
  state: text("state", { length: 1024 }),
  scope: text("scope", { length: 1024 }),
  response_type: text("response_type", { length: 256 }),
  response_mode: text("response_mode", { length: 256 }),
  redirect_uri: text("redirect_uri", { length: 1024 }),
  created_at: text("created_at", { length: 255 }).notNull(),
  expires_at: text("expires_at", { length: 255 }).notNull(),
  used_at: text("used_at", { length: 255 }),
});

// ============================================================================
// ORGANIZATIONS
// ============================================================================

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

// ============================================================================
// ROLES & PERMISSIONS
// ============================================================================

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

// ============================================================================
// BRANDING & UI
// ============================================================================

export const branding = sqliteTable("branding", {
  tenant_id: text("tenant_id", { length: 255 }).primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  logo_url: text("logo_url", { length: 512 }),
  favicon_url: text("favicon_url", { length: 512 }),
  font_url: text("font_url", { length: 512 }),
  colors_primary: text("colors_primary", { length: 8 }),
  colors_page_background_type: text("colors_page_background_type", { length: 32 }),
  colors_page_background_start: text("colors_page_background_start", { length: 8 }),
  colors_page_background_end: text("colors_page_background_end", { length: 8 }),
  colors_page_background_angle_dev: integer("colors_page_background_angle_dev"),
});

export const themes = sqliteTable("themes", {
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  themeId: text("themeId", { length: 255 }).notNull(),
  displayName: text("displayName", { length: 255 }).notNull(),
  colors_primary_button_label: text("colors_primary_button_label", { length: 24 }).notNull(),
  colors_primary_button: text("colors_primary_button", { length: 24 }).notNull(),
  colors_secondary_button_border: text("colors_secondary_button_border", { length: 24 }).notNull(),
  colors_secondary_button_label: text("colors_secondary_button_label", { length: 24 }).notNull(),
  colors_base_focus_color: text("colors_base_focus_color", { length: 24 }).notNull(),
  colors_base_hover_color: text("colors_base_hover_color", { length: 24 }).notNull(),
  colors_body_text: text("colors_body_text", { length: 24 }).notNull(),
  colors_captcha_widget_theme: text("colors_captcha_widget_theme", { length: 24 }).notNull(),
  colors_error: text("colors_error", { length: 24 }).notNull(),
  colors_header: text("colors_header", { length: 24 }).notNull(),
  colors_icons: text("colors_icons", { length: 24 }).notNull(),
  colors_input_background: text("colors_input_background", { length: 24 }).notNull(),
  colors_input_border: text("colors_input_border", { length: 24 }).notNull(),
  colors_input_filled_text: text("colors_input_filled_text", { length: 24 }).notNull(),
  colors_input_labels_placeholders: text("colors_input_labels_placeholders", { length: 24 }).notNull(),
  colors_links_focused_components: text("colors_links_focused_components", { length: 24 }).notNull(),
  colors_success: text("colors_success", { length: 24 }).notNull(),
  colors_widget_background: text("colors_widget_background", { length: 24 }).notNull(),
  colors_widget_border: text("colors_widget_border", { length: 24 }).notNull(),
  borders_button_border_radius: integer("borders_button_border_radius").notNull(),
  borders_button_border_weight: integer("borders_button_border_weight").notNull(),
  borders_buttons_style: text("borders_buttons_style", { length: 24 }).notNull(),
  borders_input_border_radius: integer("borders_input_border_radius").notNull(),
  borders_input_border_weight: integer("borders_input_border_weight").notNull(),
  borders_inputs_style: text("borders_inputs_style", { length: 24 }).notNull(),
  borders_show_widget_shadow: integer("borders_show_widget_shadow", { mode: "boolean" }).notNull(),
  borders_widget_border_weight: integer("borders_widget_border_weight").notNull(),
  borders_widget_corner_radius: integer("borders_widget_corner_radius").notNull(),
  fonts_body_text_bold: integer("fonts_body_text_bold").notNull(),
  fonts_body_text_size: integer("fonts_body_text_size").notNull(),
  fonts_buttons_text_bold: integer("fonts_buttons_text_bold").notNull(),
  fonts_buttons_text_size: integer("fonts_buttons_text_size").notNull(),
  fonts_font_url: text("fonts_font_url", { length: 255 }).notNull(),
  fonts_input_labels_bold: integer("fonts_input_labels_bold").notNull(),
  fonts_input_labels_size: integer("fonts_input_labels_size").notNull(),
  fonts_links_bold: integer("fonts_links_bold", { mode: "boolean" }).notNull(),
  fonts_links_size: integer("fonts_links_size").notNull(),
  fonts_links_style: text("fonts_links_style", { length: 24 }).notNull(),
  fonts_reference_text_size: integer("fonts_reference_text_size").notNull(),
  fonts_subtitle_bold: integer("fonts_subtitle_bold", { mode: "boolean" }).notNull(),
  fonts_subtitle_size: integer("fonts_subtitle_size").notNull(),
  fonts_title_bold: integer("fonts_title_bold", { mode: "boolean" }).notNull(),
  fonts_title_size: integer("fonts_title_size").notNull(),
  page_background_background_color: text("page_background_background_color", { length: 24 }).notNull(),
  page_background_background_image_url: text("page_background_background_image_url", { length: 255 }).notNull(),
  page_background_page_layout: text("page_background_page_layout", { length: 24 }).notNull(),
  widget_header_text_alignment: text("widget_header_text_alignment", { length: 24 }).notNull(),
  widget_logo_height: integer("widget_logo_height").notNull(),
  widget_logo_position: text("widget_logo_position", { length: 24 }).notNull(),
  widget_logo_url: text("widget_logo_url", { length: 255 }).notNull(),
  widget_social_buttons_layout: text("widget_social_buttons_layout", { length: 24 }).notNull(),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenant_id, table.themeId], name: "themes_pkey" }),
  index("themes_tenant_id_idx").on(table.tenant_id),
]);

export const forms = sqliteTable("forms", {
  id: text("id", { length: 255 }).primaryKey(),
  name: text("name", { length: 255 }).notNull(),
  tenant_id: text("tenant_id", { length: 255 }).notNull(),
  messages: text("messages", { length: 255 }),
  languages: text("languages", { length: 255 }),
  translations: text("translations", { length: 4096 }),
  nodes: text("nodes", { length: 4096 }),
  start: text("start", { length: 255 }),
  ending: text("ending", { length: 255 }),
  style: text("style", { length: 1042 }),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
}, (table) => [
  index("forms_tenant_id_idx").on(table.tenant_id),
]);

export const flows = sqliteTable("flows", {
  id: text("id", { length: 21 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 191 }).notNull(),
  name: text("name", { length: 150 }).notNull(),
  actions: text("actions"),
  created_at: text("created_at", { length: 35 }).notNull(),
  updated_at: text("updated_at", { length: 35 }).notNull(),
}, (table) => [
  index("flows_tenant_id_idx").on(table.tenant_id),
]);

export const promptSettings = sqliteTable("prompt_settings", {
  tenant_id: text("tenant_id", { length: 64 }).primaryKey(),
  universal_login_experience: text("universal_login_experience", { length: 16 }).notNull().default("new"),
  identifier_first: integer("identifier_first", { mode: "boolean" }).notNull().default(true),
  password_first: integer("password_first", { mode: "boolean" }).notNull().default(false),
  webauthn_platform_first_factor: integer("webauthn_platform_first_factor", { mode: "boolean" }).notNull().default(false),
});

export const emailProviders = sqliteTable("email_providers", {
  tenant_id: text("tenant_id", { length: 255 }).primaryKey(),
  name: text("name", { length: 255 }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  default_from_address: text("default_from_address", { length: 255 }),
  credentials: text("credentials", { length: 2048 }).notNull().default("{}"),
  settings: text("settings", { length: 2048 }).notNull().default("{}"),
  created_at: text("created_at", { length: 29 }).notNull(),
  updated_at: text("updated_at", { length: 29 }).notNull(),
});

export const hooks = sqliteTable("hooks", {
  hook_id: text("hook_id", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  url: text("url", { length: 512 }).notNull(),
  trigger_id: text("trigger_id", { length: 255 }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
  synchronous: integer("synchronous", { mode: "boolean" }).notNull().default(false),
  priority: integer("priority"),
  form_id: text("form_id"),
  url_tmp: text("url_tmp", { length: 512 }),
});

export const keys = sqliteTable("keys", {
  kid: text("kid", { length: 255 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).references(() => tenants.id, { onDelete: "cascade" }),
  created_at: text("created_at", { length: 255 }).notNull(),
  revoked_at: text("revoked_at", { length: 255 }),
  cert: text("cert", { length: 4096 }),
  pkcs7: text("pkcs7", { length: 4096 }),
  fingerprint: text("fingerprint", { length: 256 }),
  thumbprint: text("thumbprint", { length: 256 }),
  current_since: text("current_since", { length: 256 }),
  current_until: text("current_until", { length: 256 }),
  type: text("type", { length: 50 }).notNull().default("jwt_signing"),
  connection: text("connection", { length: 255 }).references(() => connections.id, { onDelete: "cascade" }),
});

// ============================================================================
// LOGS
// ============================================================================

export const logs = sqliteTable("logs", {
  log_id: text("log_id", { length: 21 }).primaryKey(),
  category: text("category", { length: 255 }),
  tenant_id: text("tenant_id", { length: 64 }),
  user_id: text("user_id", { length: 64 }),
  ip: text("ip", { length: 255 }),
  type: text("type", { length: 8 }).notNull(),
  date: text("date", { length: 25 }).notNull(),
  client_id: text("client_id", { length: 255 }),
  client_name: text("client_name", { length: 255 }),
  user_agent: text("user_agent", { length: 255 }),
  description: text("description", { length: 255 }),
  details: text("details", { length: 2048 }),
  isMobile: integer("isMobile"),
  user_name: text("user_name", { length: 255 }),
  connection: text("connection", { length: 255 }),
  connection_id: text("connection_id", { length: 255 }),
  audience: text("audience", { length: 255 }),
  scope: text("scope", { length: 255 }),
  strategy: text("strategy", { length: 255 }),
  strategy_type: text("strategy_type", { length: 255 }),
  hostname: text("hostname", { length: 255 }),
  auth0_client: text("auth0_client", { length: 8192 }),
  session_connection: text("session_connection", { length: 255 }),
  country_code: text("country_code", { length: 2 }),
  city_name: text("city_name", { length: 255 }),
  latitude: text("latitude", { length: 255 }),
  longitude: text("longitude", { length: 255 }),
  time_zone: text("time_zone", { length: 255 }),
  continent_code: text("continent_code", { length: 2 }),
}, (table) => [
  index("logs_user_id").on(table.user_id),
  index("logs_tenant_id").on(table.tenant_id),
  index("logs_date").on(table.date),
  index("IDX_logs_tenant_date_type_user").on(table.tenant_id, table.date, table.type, table.user_id),
]);

// ============================================================================
// LEGACY TABLES (for migration compatibility)
// ============================================================================

export const tenantSettings = sqliteTable("tenant_settings", {
  tenant_id: text("tenant_id", { length: 191 }).primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  idle_session_lifetime: integer("idle_session_lifetime"),
  session_lifetime: integer("session_lifetime"),
  session_cookie: text("session_cookie"),
  enable_client_connections: integer("enable_client_connections"),
  default_redirection_uri: text("default_redirection_uri"),
  enabled_locales: text("enabled_locales"),
  default_directory: text("default_directory", { length: 255 }),
  error_page: text("error_page"),
  flags: text("flags"),
  friendly_name: text("friendly_name", { length: 255 }),
  picture_url: text("picture_url"),
  support_email: text("support_email", { length: 255 }),
  support_url: text("support_url"),
  sandbox_version: text("sandbox_version", { length: 50 }),
  sandbox_versions_available: text("sandbox_versions_available"),
  change_password: text("change_password"),
  guardian_mfa_page: text("guardian_mfa_page"),
  default_audience: text("default_audience", { length: 255 }),
  default_organization: text("default_organization", { length: 255 }),
  sessions: text("sessions"),
});

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
  disable_sign_ups: text("disable_sign_ups"),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
});

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

export const customDomains = sqliteTable("custom_domains", {
  custom_domain_id: text("custom_domain_id", { length: 256 }).primaryKey(),
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
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
  tenant_id: text("tenant_id", { length: 255 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  domain: text("domain", { length: 255 }).notNull(),
  email_service: text("email_service", { length: 255 }),
  email_api_key: text("email_api_key", { length: 255 }),
  dkim_private_key: text("dkim_private_key", { length: 2048 }),
  dkim_public_key: text("dkim_public_key", { length: 2048 }),
  created_at: text("created_at", { length: 255 }).notNull(),
  updated_at: text("updated_at", { length: 255 }).notNull(),
});
