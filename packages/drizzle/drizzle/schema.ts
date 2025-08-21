import {
  mysqlTable,
  primaryKey,
  varchar,
  int,
  foreignKey,
  index,
  text,
  tinyint,
} from "drizzle-orm/mysql-core";

export const applications = mysqlTable(
  "applications",
  {
    id: varchar({ length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    clientSecret: varchar("client_secret", { length: 255 }),
    allowedLogoutUrls: varchar("allowed_logout_urls", { length: 255 }),
    authenticationSettings: varchar("authentication_settings", { length: 255 }),
    emailValidation: varchar("email_validation", { length: 255 }),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
    disableSignUps: tinyint("disable_sign_ups").notNull(),
    addons: varchar({ length: 4096 }).default("{}").notNull(),
    callbacks: varchar({ length: 1024 }).default("[]").notNull(),
    allowedOrigins: varchar("allowed_origins", { length: 1024 })
      .default("[]")
      .notNull(),
    webOrigins: varchar("web_origins", { length: 1024 })
      .default("[]")
      .notNull(),
    allowedClients: varchar("allowed_clients", { length: 1024 })
      .default("[]")
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.id], name: "applications_id" })],
);

export const branding = mysqlTable(
  "branding",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    logoUrl: varchar("logo_url", { length: 512 }),
    faviconUrl: varchar("favicon_url", { length: 512 }),
    fontUrl: varchar("font_url", { length: 512 }),
    colorsPrimary: varchar("colors_primary", { length: 8 }),
    colorsPageBackgroundType: varchar("colors_page_background_type", {
      length: 32,
    }),
    colorsPageBackgroundStart: varchar("colors_page_background_start", {
      length: 8,
    }),
    colorsPageBackgroundEnd: varchar("colors_page_background_end", {
      length: 8,
    }),
    colorsPageBackgroundAngleDev: int("colors_page_background_angle_dev"),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId], name: "branding_tenant_id" }),
  ],
);

export const codes = mysqlTable(
  "codes",
  {
    codeId: varchar("code_id", { length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 255 }),
    loginId: varchar("login_id", { length: 255 }),
    connectionId: varchar("connection_id", { length: 255 }),
    codeType: varchar("code_type", { length: 255 }).notNull(),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    expiresAt: varchar("expires_at", { length: 255 }).notNull(),
    usedAt: varchar("used_at", { length: 255 }),
    codeVerifier: varchar("code_verifier", { length: 128 }),
    codeChallenge: varchar("code_challenge", { length: 128 }),
    codeChallengeMethod: varchar("code_challenge_method", { length: 5 }),
    redirectUri: varchar("redirect_uri", { length: 1024 }),
    nonce: varchar({ length: 1024 }),
    state: varchar({ length: 2048 }),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.tenantId],
      foreignColumns: [users.userId, users.tenantId],
      name: "FK_codes_user_id_tenant_id_constraint",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.codeId, table.codeType, table.tenantId],
      name: "codes_code_id_code_type_tenant_id",
    }),
  ],
);

export const connections = mysqlTable(
  "connections",
  {
    id: varchar({ length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    responseType: varchar("response_type", { length: 255 }),
    responseMode: varchar("response_mode", { length: 255 }),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
    options: varchar({ length: 2048 }).default("{}").notNull(),
    strategy: varchar({ length: 64 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.id], name: "connections_id" })],
);

export const customDomains = mysqlTable(
  "custom_domains",
  {
    customDomainId: varchar("custom_domain_id", { length: 256 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    domain: varchar({ length: 255 }).notNull(),
    primary: tinyint().notNull(),
    status: varchar({ length: 50 }).notNull(),
    type: varchar({ length: 50 }).notNull(),
    originDomainName: varchar("origin_domain_name", { length: 255 }),
    verification: varchar({ length: 2048 }),
    customClientIpHeader: varchar("custom_client_ip_header", { length: 50 }),
    tlsPolicy: varchar("tls_policy", { length: 50 }),
    domainMetadata: varchar("domain_metadata", { length: 2048 }),
    createdAt: varchar("created_at", { length: 35 }).notNull(),
    updatedAt: varchar("updated_at", { length: 35 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.customDomainId],
      name: "custom_domains_custom_domain_id",
    }),
  ],
);

export const emailProviders = mysqlTable(
  "email_providers",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    enabled: tinyint().notNull(),
    defaultFromAddress: varchar("default_from_address", { length: 255 }),
    credentials: varchar({ length: 2048 }).default("{}").notNull(),
    settings: varchar({ length: 2048 }).default("{}").notNull(),
    createdAt: varchar("created_at", { length: 29 }).notNull(),
    updatedAt: varchar("updated_at", { length: 29 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId],
      name: "email_providers_tenant_id",
    }),
  ],
);

export const forms = mysqlTable(
  "forms",
  {
    id: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    messages: varchar({ length: 255 }),
    languages: varchar({ length: 255 }),
    translations: varchar({ length: 4096 }),
    nodes: varchar({ length: 4096 }),
    start: varchar({ length: 255 }),
    ending: varchar({ length: 255 }),
    style: varchar({ length: 1042 }),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
  },
  (table) => [
    index("forms_tenant_id_idx").on(table.tenantId),
    primaryKey({ columns: [table.id], name: "forms_id" }),
  ],
);

export const hooks = mysqlTable(
  "hooks",
  {
    hookId: varchar("hook_id", { length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    triggerId: varchar("trigger_id", { length: 255 }).notNull(),
    enabled: tinyint().notNull(),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
    synchronous: tinyint().default(0).notNull(),
    priority: int(),
    formId: text("form_id"),
    url: varchar({ length: 512 }),
  },
  (table) => [primaryKey({ columns: [table.hookId], name: "hooks_hook_id" })],
);

export const keys = mysqlTable(
  "keys",
  {
    kid: varchar({ length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).references(
      () => tenants.id,
      { onDelete: "cascade" },
    ),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    revokedAt: varchar("revoked_at", { length: 255 }),
    cert: varchar({ length: 4096 }),
    pkcs7: varchar({ length: 4096 }),
    fingerprint: varchar({ length: 256 }),
    thumbprint: varchar({ length: 256 }),
    currentSince: varchar("current_since", { length: 256 }),
    currentUntil: varchar("current_until", { length: 256 }),
    connection: varchar({ length: 255 }).references(() => connections.id, {
      onDelete: "cascade",
    }),
    type: varchar({ length: 50 }).notNull().default("jwt_signing"),
  },
  (table) => [primaryKey({ columns: [table.kid], name: "keys_kid" })],
);

export const kyselyMigration = mysqlTable(
  "kysely_migration",
  {
    name: varchar({ length: 255 }).notNull(),
    timestamp: varchar({ length: 255 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.name], name: "kysely_migration_name" }),
  ],
);

export const kyselyMigrationLock = mysqlTable(
  "kysely_migration_lock",
  {
    id: varchar({ length: 255 }).notNull(),
    isLocked: int("is_locked").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: "kysely_migration_lock_id" }),
  ],
);

export const loginSessions = mysqlTable(
  "login_sessions",
  {
    id: varchar({ length: 21 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    sessionId: varchar("session_id", { length: 21 }).references(
      () => sessions.id,
      { onDelete: "cascade" },
    ),
    csrfToken: varchar("csrf_token", { length: 21 }).notNull(),
    authParamsClientId: varchar("authParams_client_id", {
      length: 255,
    }).notNull(),
    authParamsVendorId: varchar("authParams_vendor_id", { length: 255 }),
    authParamsUsername: varchar("authParams_username", { length: 255 }),
    authParamsResponseType: varchar("authParams_response_type", {
      length: 255,
    }),
    authParamsResponseMode: varchar("authParams_response_mode", {
      length: 255,
    }),
    authParamsAudience: varchar("authParams_audience", { length: 255 }),
    authParamsScope: varchar("authParams_scope", { length: 511 }),
    authParamsState: varchar("authParams_state", { length: 2048 }),
    authParamsNonce: varchar("authParams_nonce", { length: 255 }),
    authParamsCodeChallengeMethod: varchar("authParams_code_challenge_method", {
      length: 255,
    }),
    authParamsCodeChallenge: varchar("authParams_code_challenge", {
      length: 255,
    }),
    authParamsRedirectUri: varchar("authParams_redirect_uri", { length: 255 }),
    authParamsOrganization: varchar("authParams_organization", { length: 255 }),
    authParamsPrompt: varchar("authParams_prompt", { length: 32 }),
    authParamsActAs: varchar("authParams_act_as", { length: 256 }),
    authParamsUiLocales: varchar("authParams_ui_locales", { length: 32 }),
    authorizationUrl: varchar("authorization_url", { length: 1024 }),
    createdAt: varchar("created_at", { length: 35 }).notNull(),
    updatedAt: varchar("updated_at", { length: 35 }).notNull(),
    expiresAt: varchar("expires_at", { length: 35 }).notNull(),
    ip: varchar({ length: 39 }),
    useragent: varchar({ length: 1024 }),
    auth0Client: varchar({ length: 255 }),
    loginCompleted: tinyint("login_completed").default(0).notNull(),
  },
  (table) => [
    index("idx_login_sessions_session_id").on(table.sessionId),
    primaryKey({ columns: [table.id], name: "login_sessions_id" }),
  ],
);

export const logs = mysqlTable(
  "logs",
  {
    id: varchar({ length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    ip: varchar({ length: 255 }),
    type: varchar({ length: 8 }).notNull(),
    date: varchar({ length: 25 }).notNull(),
    description: varchar({ length: 255 }),
    clientId: varchar("client_id", { length: 255 }),
    clientName: varchar("client_name", { length: 255 }),
    userAgent: varchar("user_agent", { length: 1024 }),
    details: varchar({ length: 8192 }),
    userName: varchar("user_name", { length: 255 }),
    auth0Client: varchar("auth0_client", { length: 255 }),
    isMobile: tinyint(),
    connection: varchar({ length: 255 }),
    connectionId: varchar("connection_id", { length: 255 }),
    audience: varchar({ length: 255 }),
    scope: varchar({ length: 255 }),
    strategy: varchar({ length: 255 }),
    strategyType: varchar("strategy_type", { length: 255 }),
    hostname: varchar({ length: 255 }),
    sessionConnection: varchar("session_connection", { length: 255 }),
  },
  (table) => [
    index("IDX_logs_tenant_date_type_user").on(
      table.tenantId,
      table.date,
      table.type,
      table.userId,
    ),
    index("logs_date").on(table.date),
    index("logs_tenant_id").on(table.tenantId),
    index("logs_user_id").on(table.userId),
    primaryKey({ columns: [table.id], name: "logs_id" }),
  ],
);

export const members = mysqlTable(
  "members",
  {
    id: varchar({ length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    sub: varchar({ length: 255 }),
    email: varchar({ length: 255 }),
    name: varchar({ length: 255 }),
    status: varchar({ length: 255 }),
    role: varchar({ length: 255 }),
    picture: varchar({ length: 255 }),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.id], name: "members_id" })],
);

export const migrations = mysqlTable(
  "migrations",
  {
    id: varchar({ length: 255 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    provider: varchar({ length: 255 }),
    clientId: varchar("client_id", { length: 255 }),
    origin: varchar({ length: 255 }),
    domain: varchar({ length: 255 }),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.id], name: "migrations_id" })],
);

export const passwords = mysqlTable(
  "passwords",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
    password: varchar({ length: 255 }).notNull(),
    algorithm: varchar({ length: 16 }),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.tenantId],
      name: "passwords_user_id_tenant_id",
    }),
  ],
);

export const promptSettings = mysqlTable(
  "prompt_settings",
  {
    tenantId: varchar("tenant_id", { length: 64 }).notNull(),
    universalLoginExperience: varchar("universal_login_experience", {
      length: 16,
    })
      .default("new")
      .notNull(),
    identifierFirst: tinyint("identifier_first").default(1).notNull(),
    passwordFirst: tinyint("password_first").default(0).notNull(),
    webauthnPlatformFirstFactor: tinyint("webauthn_platform_first_factor")
      .default(0)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId],
      name: "prompt_settings_tenant_id",
    }),
  ],
);

export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: varchar({ length: 21 }).notNull(),
    clientId: varchar("client_id", { length: 21 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }),
    sessionId: varchar("session_id", { length: 21 }).notNull(),
    userId: varchar("user_id", { length: 255 }),
    createdAt: varchar("created_at", { length: 35 }).notNull(),
    expiresAt: varchar("expires_at", { length: 35 }),
    idleExpiresAt: varchar("idle_expires_at", { length: 35 }),
    lastExchangedAt: varchar("last_exchanged_at", { length: 35 }),
    device: varchar({ length: 2048 }).notNull(),
    resourceServers: varchar("resource_servers", { length: 2048 }).notNull(),
    rotating: tinyint().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.tenantId],
      foreignColumns: [users.userId, users.tenantId],
      name: "refresh_tokens_user_id_constraint",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id], name: "refresh_tokens_id" }),
  ],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar({ length: 21 }).notNull(),
    tenantId: varchar("tenant_id", { length: 255 }),
    userId: varchar("user_id", { length: 255 }),
    createdAt: varchar("created_at", { length: 35 }).notNull(),
    updatedAt: varchar("updated_at", { length: 35 }).notNull(),
    expiresAt: varchar("expires_at", { length: 35 }),
    idleExpiresAt: varchar("idle_expires_at", { length: 35 }),
    authenticatedAt: varchar("authenticated_at", { length: 35 }),
    lastInteractionAt: varchar("last_interaction_at", { length: 35 }),
    usedAt: varchar("used_at", { length: 35 }),
    revokedAt: varchar("revoked_at", { length: 35 }),
    device: varchar({ length: 2048 }).notNull(),
    clients: varchar({ length: 1024 }).notNull(),
    loginSessionId: varchar("login_session_id", { length: 21 }),
  },
  (table) => [
    index("IDX_sessions_login_session_id").on(table.loginSessionId),
    foreignKey({
      columns: [table.userId, table.tenantId],
      foreignColumns: [users.userId, users.tenantId],
      name: "sessions_user_id_constraint",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id], name: "sessions_id" }),
  ],
);

export const tenants = mysqlTable(
  "tenants",
  {
    id: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 255 }),
    audience: varchar({ length: 255 }),
    senderEmail: varchar("sender_email", { length: 255 }),
    senderName: varchar("sender_name", { length: 255 }),
    language: varchar({ length: 255 }),
    logo: varchar({ length: 255 }),
    primaryColor: varchar("primary_color", { length: 255 }),
    secondaryColor: varchar("secondary_color", { length: 255 }),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
    supportUrl: varchar("support_url", { length: 255 }),
  },
  (table) => [primaryKey({ columns: [table.id], name: "tenants_id" })],
);

export const users = mysqlTable(
  "users",
  {
    tenantId: varchar("tenant_id", { length: 255 }).notNull(),
    email: varchar({ length: 255 }),
    givenName: varchar("given_name", { length: 255 }),
    familyName: varchar("family_name", { length: 255 }),
    nickname: varchar({ length: 255 }),
    name: varchar({ length: 255 }),
    picture: varchar({ length: 2083 }),
    createdAt: varchar("created_at", { length: 255 }).notNull(),
    updatedAt: varchar("updated_at", { length: 255 }).notNull(),
    linkedTo: varchar("linked_to", { length: 255 }),
    lastIp: varchar("last_ip", { length: 255 }),
    loginCount: int("login_count").notNull(),
    lastLogin: varchar("last_login", { length: 255 }),
    provider: varchar({ length: 255 }).notNull(),
    connection: varchar({ length: 255 }).notNull(),
    emailVerified: tinyint("email_verified").notNull(),
    isSocial: tinyint("is_social").notNull(),
    appMetadata: varchar("app_metadata", { length: 4096 })
      .default("{}")
      .notNull(),
    profileData: varchar({ length: 2048 }),
    locale: varchar({ length: 255 }),
    userId: varchar("user_id", { length: 255 }).notNull(),
    userMetadata: varchar("user_metadata", { length: 4096 })
      .default("{}")
      .notNull(),
    phoneNumber: varchar("phone_number", { length: 17 }),
    phoneVerified: tinyint("phone_verified"),
    username: varchar({ length: 128 }),
  },
  (table) => [
    index("unique_email_provider").on(
      table.email,
      table.provider,
      table.tenantId,
    ),
    index("users_linked_to_index").on(table.linkedTo),
    index("users_name_index").on(table.name),
    index("users_tenant_index").on(table.tenantId),
    index("users_user_id_tenant_id").on(table.userId, table.tenantId),
    primaryKey({
      columns: [table.tenantId, table.userId],
      name: "users_tenant_id_user_id",
    }),
  ],
);
