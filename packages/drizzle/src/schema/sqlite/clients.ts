import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { tenants } from "./tenants";

export const clients = sqliteTable(
  "clients",
  {
    client_id: text("client_id", { length: 191 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name", { length: 255 }).notNull(),
    description: text("description", { length: 140 }),
    global: integer("global").notNull().default(0),
    client_secret: text("client_secret", { length: 255 }),
    app_type: text("app_type", { length: 64 }).default("regular_web"),
    logo_uri: text("logo_uri", { length: 2083 }),
    is_first_party: integer("is_first_party").notNull().default(0),
    oidc_conformant: integer("oidc_conformant").notNull().default(1),
    auth0_conformant: integer("auth0_conformant").notNull().default(1),
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
    cross_origin_authentication: integer("cross_origin_authentication")
      .notNull()
      .default(0),
    cross_origin_loc: text("cross_origin_loc", { length: 2083 }),
    custom_login_page_on: integer("custom_login_page_on").notNull().default(0),
    custom_login_page: text("custom_login_page"),
    custom_login_page_preview: text("custom_login_page_preview"),
    form_template: text("form_template"),
    addons: text("addons").notNull(),
    token_endpoint_auth_method: text("token_endpoint_auth_method", {
      length: 64,
    }).default("client_secret_basic"),
    client_metadata: text("client_metadata").notNull(),
    mobile: text("mobile").notNull(),
    initiate_login_uri: text("initiate_login_uri", { length: 2083 }),
    native_social_login: text("native_social_login").notNull(),
    refresh_token: text("refresh_token").notNull(),
    default_organization: text("default_organization").notNull(),
    organization_usage: text("organization_usage", { length: 32 }).default(
      "deny",
    ),
    organization_require_behavior: text("organization_require_behavior", {
      length: 32,
    }).default("no_prompt"),
    client_authentication_methods: text(
      "client_authentication_methods",
    ).notNull(),
    require_pushed_authorization_requests: integer(
      "require_pushed_authorization_requests",
    )
      .notNull()
      .default(0),
    require_proof_of_possession: integer("require_proof_of_possession")
      .notNull()
      .default(0),
    signed_request_object: text("signed_request_object").notNull(),
    compliance_level: text("compliance_level", { length: 64 }),
    par_request_expiry: integer("par_request_expiry"),
    token_quota: text("token_quota").notNull(),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
    connections: text("connections").notNull().default("[]"),
    owner_user_id: text("owner_user_id", { length: 255 }),
    registration_type: text("registration_type", { length: 32 }),
    registration_metadata: text("registration_metadata"),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.client_id],
      name: "clients_tenant_id_client_id",
    }),
    index("idx_clients_owner_user_id").on(table.tenant_id, table.owner_user_id),
  ],
);

export const clientRegistrationTokens = sqliteTable(
  "client_registration_tokens",
  {
    id: text("id", { length: 255 }).primaryKey(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    token_hash: text("token_hash", { length: 64 }).notNull(),
    type: text("type", { length: 8 }).notNull(),
    client_id: text("client_id", { length: 191 }),
    sub: text("sub", { length: 255 }),
    constraints: text("constraints"),
    single_use: integer("single_use").notNull().default(0),
    used_at_ts: integer("used_at_ts"),
    expires_at_ts: integer("expires_at_ts"),
    created_at_ts: integer("created_at_ts").notNull(),
    revoked_at_ts: integer("revoked_at_ts"),
  },
  (table) => [
    uniqueIndex("idx_client_registration_tokens_hash").on(
      table.tenant_id,
      table.token_hash,
    ),
    index("idx_client_registration_tokens_client").on(
      table.tenant_id,
      table.client_id,
    ),
  ],
);

export const clientGrants = sqliteTable(
  "client_grants",
  {
    id: text("id", { length: 21 }).notNull(),
    tenant_id: text("tenant_id", { length: 191 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    client_id: text("client_id", { length: 191 }).notNull(),
    audience: text("audience", { length: 191 }).notNull(),
    scope: text("scope").default("[]"),
    organization_usage: text("organization_usage", { length: 32 }),
    allow_any_organization: integer("allow_any_organization").default(0),
    is_system: integer("is_system").default(0),
    subject_type: text("subject_type", { length: 32 }),
    authorization_details_types: text("authorization_details_types").default(
      "[]",
    ),
    created_at: text("created_at", { length: 35 }).notNull(),
    updated_at: text("updated_at", { length: 35 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.id],
      name: "pk_client_grants",
    }),
    index("idx_client_grants_audience").on(table.audience),
  ],
);
