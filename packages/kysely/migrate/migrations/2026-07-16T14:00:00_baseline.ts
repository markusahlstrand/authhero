import { CreateTableBuilder, Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Consolidated baseline: the whole schema as a single migration.
 *
 * Generated from the live production schema (verified identical to dev), not
 * from replaying the historical set. That set cannot be replayed from scratch
 * on MySQL: two 2023 migrations both name a foreign key `user_id_constraint`,
 * and MySQL scopes FK names per-database, so a fresh replay dies at migration
 * 7 of 183. Production exists only because the set was applied incrementally
 * over three years, with those tables later dropped and recreated under unique
 * names.
 *
 * ## What production being the source implies
 *
 * Production runs on PlanetScale, so this snapshot reflects what PlanetScale
 * reports — not what the historical migrations declare. Where the two differ,
 * production wins here, deliberately:
 *
 *   - `users` is keyed `(tenant_id, user_id)` rather than the reverse.
 *   - Several columns are narrower than the set declares (e.g. `users.locale`
 *     varchar(64), `themes.themeId` varchar(21)).
 *   - The `logs` date/tenant/user indexes exist; the historical set never had
 *     them.
 *
 * The effect is that a fresh database matches production rather than matching
 * the old migrations. That is the point: dev/prod parity. It also means this
 * baseline is NOT a faithful replay of the set it replaces.
 *
 * The exception is FOREIGN_KEYS, which restores the 17 `tenant_id -> tenants`
 * cascades production reports no trace of — see the note on that list for why
 * they cannot live in a migration on top of this file instead.
 *
 * Otherwise this file is a snapshot and nothing else: anything that landed
 * after the snapshot was captured stays a migration of its own on top of it —
 * 2026-07-16T15:00:00_codes_expires_at_ts (a column production has yet to get)
 * and 2026-07-16T16:00:00_restore_unique_phone_provider (a constraint declared
 * since the first migration that production has somehow lost).
 *
 * Charset/collation are left to the server (production is uniformly utf8mb4 /
 * utf8mb4_0900_ai_ci on InnoDB DYNAMIC — the MySQL 8 default).
 *
 * ## Why the foreign keys are applied two different ways
 *
 * SQLite has no `ALTER TABLE ADD CONSTRAINT`, so its foreign keys MUST be
 * declared inline at CREATE TABLE.
 *
 * MySQL must NOT have them inline. It auto-creates a backing index for any
 * foreign key not already covered by one, and at CREATE TABLE time the
 * secondary indexes don't exist yet — five of production's FKs are covered
 * only by a secondary index (e.g. `client_grants` by
 * `uq_client_grants_tenant_client_audience`), so inlining would leave five
 * indexes production doesn't have. Adding the FKs after the indexes lets MySQL
 * reuse the real ones, reproducing production exactly.
 *
 * Tables are created parents-first either way, so the inline path never
 * references a table that doesn't exist yet. `tenants` is created first, ahead
 * of the 17 tables whose restored `tenant_id` FK points at it.
 */

interface ForeignKey {
  table: string;
  name: string;
  columns: string[];
  references: string;
  referencedColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

const FOREIGN_KEYS: ForeignKey[] = [
  // ---------------------------------------------------------------------------
  // tenant_id -> tenants.id
  //
  // Absent from the production snapshot, and restored here rather than in a
  // migration on top of it because neither engine can add them later: SQLite
  // has no ALTER TABLE ADD CONSTRAINT, and on PlanetScale FK DDL is exactly
  // what does not work.
  //
  // Production lacking them was never a decision. The historical set declared
  // every one of these inline at CREATE TABLE; SQLite created them, Vitess
  // silently ignored them. Dropping them here would therefore not track
  // production so much as bake in the reason production drifted — and it would
  // take the #972 guard (rows accepted for a tenant that does not exist) with
  // it, which packages/multi-tenancy asserts.
  //
  // This is a no-op for production, which reconciles its migration history and
  // never re-executes the baseline. It restores the pre-squash status quo for
  // SQLite/D1 and fresh MySQL.
  // ---------------------------------------------------------------------------
  {
    table: "authentication_methods",
    name: "fk_authentication_methods_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "branding",
    name: "fk_branding_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "client_grants",
    name: "fk_client_grants_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "client_registration_tokens",
    name: "fk_client_registration_tokens_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "clients",
    name: "fk_clients_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "codes",
    name: "fk_codes_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "connections",
    name: "fk_connections_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "custom_domains",
    name: "fk_custom_domains_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "custom_text",
    name: "fk_custom_text_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "grants",
    name: "fk_grants_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "hooks",
    name: "fk_hooks_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "keys",
    name: "fk_keys_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "migrations",
    name: "fk_migrations_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "passwords",
    name: "fk_passwords_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "themes",
    name: "fk_themes_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "universal_login_templates",
    name: "fk_universal_login_templates_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "users",
    name: "fk_users_tenants",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "client_grants",
    name: "fk_client_grants_clients",
    columns: ["tenant_id", "client_id"],
    references: "clients",
    referencedColumns: ["tenant_id", "client_id"],
    onDelete: "cascade",
  },
  {
    table: "codes",
    name: "FK_codes_user_id_tenant_id_constraint",
    columns: ["user_id", "tenant_id"],
    references: "users",
    referencedColumns: ["user_id", "tenant_id"],
    onDelete: "cascade",
  },
  {
    table: "email_templates",
    name: "email_templates_tenant_fk",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "grants",
    name: "grants_user_id_constraint",
    columns: ["user_id", "tenant_id"],
    references: "users",
    referencedColumns: ["user_id", "tenant_id"],
    onDelete: "cascade",
  },
  {
    table: "login_sessions",
    name: "login_sessions_session_fk",
    columns: ["tenant_id", "session_id"],
    references: "sessions",
    referencedColumns: ["tenant_id", "id"],
    onDelete: "cascade",
  },
  {
    table: "login_sessions",
    name: "login_sessions_tenant_fk",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "organization_connections",
    name: "organization_connections_connection_fk",
    columns: ["tenant_id", "connection_id"],
    references: "connections",
    referencedColumns: ["tenant_id", "id"],
    onDelete: "cascade",
  },
  {
    table: "organization_connections",
    name: "organization_connections_organization_fk",
    columns: ["organization_id"],
    references: "organizations",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "passwords",
    name: "password_history_user_id_tenant_id_constraint",
    columns: ["user_id", "tenant_id"],
    references: "users",
    referencedColumns: ["user_id", "tenant_id"],
    onDelete: "cascade",
  },
  {
    table: "refresh_tokens",
    name: "refresh_tokens_client_fk",
    columns: ["tenant_id", "client_id"],
    references: "clients",
    referencedColumns: ["tenant_id", "client_id"],
    onDelete: "cascade",
  },
  {
    table: "refresh_tokens",
    name: "refresh_tokens_tenant_fk",
    columns: ["tenant_id"],
    references: "tenants",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "sessions",
    name: "sessions_user_fk",
    columns: ["user_id", "tenant_id"],
    references: "users",
    referencedColumns: ["user_id", "tenant_id"],
    onDelete: "cascade",
  },
  {
    table: "tenant_operation_events",
    name: "tenant_operation_events_operation_id_constraint",
    columns: ["operation_id"],
    references: "tenant_operations",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "user_activity",
    name: "user_activity_user_id_constraint",
    columns: ["user_id", "tenant_id"],
    references: "users",
    referencedColumns: ["user_id", "tenant_id"],
    onDelete: "cascade",
  },
  {
    table: "user_organizations",
    name: "fk_user_organizations_organization",
    columns: ["organization_id"],
    references: "organizations",
    referencedColumns: ["id"],
    onDelete: "cascade",
  },
  {
    table: "user_organizations",
    name: "fk_user_organizations_user",
    columns: ["tenant_id", "user_id"],
    references: "users",
    referencedColumns: ["tenant_id", "user_id"],
    onDelete: "cascade",
  },
];

/**
 * SQLite is detected by asking it. Every SQLite driver answers
 * `sqlite_version()`; no other engine has it. Cheaper in maintenance than
 * matching on adapter internals, which vary by driver (better-sqlite3, bun,
 * D1).
 */
async function isSqlite(db: Kysely<Database>): Promise<boolean> {
  try {
    await sql`select sqlite_version()`.execute(db);
    return true;
  } catch {
    return false;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function inlineForeignKeys(
  builder: CreateTableBuilder<any, any>,
  table: string,
): CreateTableBuilder<any, any> {
  let b = builder;
  for (const fk of FOREIGN_KEYS) {
    if (fk.table !== table) continue;
    b = b.addForeignKeyConstraint(
      fk.name,
      fk.columns as any,
      fk.references,
      fk.referencedColumns as any,
      (cb) => {
        let c = cb;
        if (fk.onDelete) c = c.onDelete(fk.onDelete as any);
        if (fk.onUpdate) c = c.onUpdate(fk.onUpdate as any);
        return c;
      },
    );
  }
  return b;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function up(db: Kysely<Database>): Promise<void> {
  const sqlite = await isSqlite(db);

  await db.schema
    .createTable("tenants")
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("audience", sql`varchar(255)`)
    .addColumn("sender_email", sql`varchar(255)`)
    .addColumn("sender_name", sql`varchar(255)`)
    .addColumn("created_at", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("support_url", sql`varchar(255)`)
    .addColumn("idle_session_lifetime", sql`int`)
    .addColumn("session_lifetime", sql`int`)
    .addColumn("session_cookie", sql`text`)
    .addColumn("allowed_logout_urls", sql`text`)
    .addColumn("ephemeral_session_lifetime", sql`int`)
    .addColumn("idle_ephemeral_session_lifetime", sql`int`)
    .addColumn("default_redirection_uri", sql`text`)
    .addColumn("enabled_locales", sql`text`)
    .addColumn("default_directory", sql`varchar(255)`)
    .addColumn("error_page", sql`text`)
    .addColumn("flags", sql`text`)
    .addColumn("friendly_name", sql`varchar(255)`)
    .addColumn("picture_url", sql`text`)
    .addColumn("support_email", sql`varchar(255)`)
    .addColumn("sandbox_version", sql`varchar(50)`)
    .addColumn("sandbox_versions_available", sql`text`)
    .addColumn("legacy_sandbox_version", sql`varchar(50)`)
    .addColumn("change_password", sql`text`)
    .addColumn("guardian_mfa_page", sql`text`)
    .addColumn("device_flow", sql`text`)
    .addColumn("default_token_quota", sql`text`)
    .addColumn("default_audience", sql`varchar(255)`)
    .addColumn("default_organization", sql`varchar(255)`)
    .addColumn("sessions", sql`text`)
    .addColumn("oidc_logout", sql`text`)
    .addColumn("allow_organization_name_in_authentication_api", sql`int`)
    .addColumn("customize_mfa_in_postlogin_action", sql`int`)
    .addColumn("acr_values_supported", sql`text`)
    .addColumn("mtls", sql`text`)
    .addColumn("pushed_authorization_requests_supported", sql`int`)
    .addColumn("authorization_response_iss_parameter_supported", sql`int`)
    .addColumn("mfa", sql`text`)
    .addColumn("attack_protection", sql`text`)
    .addColumn("default_client_id", sql`varchar(255)`)
    .addColumn("deployment_type", sql`varchar(16)`, (col) =>
      col.notNull().defaultTo("shared"),
    )
    .addColumn("provisioning_state", sql`varchar(16)`, (col) =>
      col.notNull().defaultTo("ready"),
    )
    .addColumn("provisioning_error", sql`varchar(2048)`)
    .addColumn("provisioning_state_changed_at", sql`varchar(35)`)
    .addColumn("bundle_configuration", sql`varchar(64)`)
    .addColumn("worker_version", sql`varchar(64)`)
    .addColumn("worker_script_name", sql`varchar(255)`)
    .addColumn("storage_kind", sql`varchar(32)`)
    .addColumn("d1_database_id", sql`varchar(64)`)
    .addColumn("database_version", sql`varchar(64)`)
    .addPrimaryKeyConstraint("tenants_pk", ["id"])
    .execute();

  await db.schema
    .createTable("action_executions")
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("trigger_id", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("status", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("results", sql`text`, (col) => col.notNull())
    .addColumn("logs", sql`text`)
    .addColumn("created_at_ts", sql`bigint`, (col) => col.notNull())
    .addColumn("updated_at_ts", sql`bigint`, (col) => col.notNull())
    .addPrimaryKeyConstraint("action_executions_pk", ["id"])
    .execute();

  await db.schema
    .createTable("action_versions")
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("action_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("number", sql`int`, (col) => col.notNull())
    .addColumn("code", sql`text`, (col) => col.notNull())
    .addColumn("runtime", sql`varchar(50)`)
    .addColumn("secrets", sql`text`)
    .addColumn("dependencies", sql`text`)
    .addColumn("supported_triggers", sql`text`)
    .addColumn("deployed", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("created_at_ts", sql`bigint`, (col) => col.notNull())
    .addColumn("updated_at_ts", sql`bigint`, (col) => col.notNull())
    .addPrimaryKeyConstraint("action_versions_pk", ["id"])
    .execute();

  await db.schema
    .createTable("actions")
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("code", sql`text`, (col) => col.notNull())
    .addColumn("runtime", sql`varchar(50)`)
    .addColumn("status", sql`varchar(50)`, (col) => col.defaultTo("built"))
    .addColumn("secrets", sql`text`)
    .addColumn("dependencies", sql`text`)
    .addColumn("supported_triggers", sql`text`)
    .addColumn("deployed_at_ts", sql`bigint`)
    .addColumn("created_at_ts", sql`bigint`, (col) => col.notNull())
    .addColumn("updated_at_ts", sql`bigint`, (col) => col.notNull())
    .addColumn("is_system", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("inherit", sql`int`, (col) => col.notNull().defaultTo(0))
    .addPrimaryKeyConstraint("actions_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("authentication_methods")
      .addColumn("id", sql`varchar(26)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("user_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("type", sql`varchar(32)`, (col) => col.notNull())
      .addColumn("phone_number", sql`varchar(32)`)
      .addColumn("totp_secret", sql`varchar(255)`)
      .addColumn("confirmed", sql`int`, (col) => col.notNull().defaultTo(0))
      .addColumn("created_at_ts", sql`bigint`, (col) => col.notNull())
      .addColumn("updated_at_ts", sql`bigint`, (col) => col.notNull())
      .addColumn("credential_id", sql`varchar(512)`)
      .addColumn("public_key", sql`text`)
      .addColumn("sign_count", sql`int`)
      .addColumn("credential_backed_up", sql`int`)
      .addColumn("transports", sql`varchar(512)`)
      .addColumn("friendly_name", sql`varchar(255)`)
      .addPrimaryKeyConstraint("authentication_methods_pk", ["id"]);
    if (sqlite) b = inlineForeignKeys(b, "authentication_methods");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("branding")
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("logo_url", sql`varchar(512)`)
      .addColumn("favicon_url", sql`varchar(512)`)
      .addColumn("font_url", sql`varchar(512)`)
      .addColumn("colors_primary", sql`varchar(8)`)
      .addColumn("colors_page_background_type", sql`varchar(32)`)
      .addColumn("colors_page_background_start", sql`varchar(8)`)
      .addColumn("colors_page_background_end", sql`varchar(8)`)
      .addColumn("colors_page_background_angle_dev", sql`int`)
      .addColumn("dark_mode", sql`varchar(8)`)
      .addPrimaryKeyConstraint("branding_pk", ["tenant_id"]);
    if (sqlite) b = inlineForeignKeys(b, "branding");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("clients")
      .addColumn("client_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("description", sql`varchar(140)`)
      .addColumn("global", sql`int`, (col) => col.notNull().defaultTo(0))
      .addColumn("client_secret", sql`varchar(255)`)
      .addColumn("app_type", sql`varchar(64)`, (col) =>
        col.defaultTo("regular_web"),
      )
      .addColumn("logo_uri", sql`varchar(2083)`)
      .addColumn("is_first_party", sql`int`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("oidc_conformant", sql`int`, (col) =>
        col.notNull().defaultTo(1),
      )
      .addColumn("callbacks", sql`text`, (col) => col.notNull())
      .addColumn("allowed_origins", sql`text`, (col) => col.notNull())
      .addColumn("web_origins", sql`text`, (col) => col.notNull())
      .addColumn("client_aliases", sql`text`, (col) => col.notNull())
      .addColumn("allowed_clients", sql`text`, (col) => col.notNull())
      .addColumn("allowed_logout_urls", sql`text`, (col) => col.notNull())
      .addColumn("session_transfer", sql`text`, (col) => col.notNull())
      .addColumn("oidc_logout", sql`text`, (col) => col.notNull())
      .addColumn("grant_types", sql`text`, (col) => col.notNull())
      .addColumn("jwt_configuration", sql`text`, (col) => col.notNull())
      .addColumn("signing_keys", sql`text`, (col) => col.notNull())
      .addColumn("encryption_key", sql`text`, (col) => col.notNull())
      .addColumn("sso", sql`int`, (col) => col.notNull().defaultTo(0))
      .addColumn("sso_disabled", sql`int`, (col) => col.notNull().defaultTo(1))
      .addColumn("cross_origin_authentication", sql`int`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("cross_origin_loc", sql`varchar(2083)`)
      .addColumn("custom_login_page_on", sql`int`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("custom_login_page", sql`text`)
      .addColumn("custom_login_page_preview", sql`text`)
      .addColumn("form_template", sql`text`)
      .addColumn("addons", sql`text`, (col) => col.notNull())
      .addColumn("token_endpoint_auth_method", sql`varchar(64)`, (col) =>
        col.defaultTo("client_secret_basic"),
      )
      .addColumn("client_metadata", sql`text`, (col) => col.notNull())
      .addColumn("mobile", sql`text`, (col) => col.notNull())
      .addColumn("initiate_login_uri", sql`varchar(2083)`)
      .addColumn("native_social_login", sql`text`, (col) => col.notNull())
      .addColumn("refresh_token", sql`text`, (col) => col.notNull())
      .addColumn("default_organization", sql`text`, (col) => col.notNull())
      .addColumn("organization_usage", sql`varchar(32)`, (col) =>
        col.defaultTo("deny"),
      )
      .addColumn("organization_require_behavior", sql`varchar(32)`, (col) =>
        col.defaultTo("no_prompt"),
      )
      .addColumn("client_authentication_methods", sql`text`, (col) =>
        col.notNull(),
      )
      .addColumn("require_pushed_authorization_requests", sql`int`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("require_proof_of_possession", sql`int`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("signed_request_object", sql`text`, (col) => col.notNull())
      .addColumn("compliance_level", sql`varchar(64)`)
      .addColumn("par_request_expiry", sql`int`)
      .addColumn("token_quota", sql`text`, (col) => col.notNull())
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("connections", sql`text`)
      .addColumn("auth0_conformant", sql`int`, (col) => col.defaultTo(1))
      .addColumn("owner_user_id", sql`varchar(255)`)
      .addColumn("registration_type", sql`varchar(32)`)
      .addColumn("registration_metadata", sql`text`)
      .addColumn("user_linking_mode", sql`varchar(16)`)
      .addColumn("hide_sign_up_disabled_error", sql`int`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addPrimaryKeyConstraint("clients_pk", ["tenant_id", "client_id"]);
    if (sqlite) b = inlineForeignKeys(b, "clients");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("client_grants")
      .addColumn("id", sql`varchar(21)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("client_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("audience", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("scope", sql`text`)
      .addColumn("organization_usage", sql`varchar(32)`)
      .addColumn("allow_any_organization", sql`int`, (col) => col.defaultTo(0))
      .addColumn("is_system", sql`int`, (col) => col.defaultTo(0))
      .addColumn("subject_type", sql`varchar(32)`)
      .addColumn("authorization_details_types", sql`text`)
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
      .addPrimaryKeyConstraint("client_grants_pk", ["tenant_id", "id"]);
    if (sqlite) b = inlineForeignKeys(b, "client_grants");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("client_registration_tokens")
      .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("token_hash", sql`varchar(64)`, (col) => col.notNull())
      .addColumn("type", sql`varchar(8)`, (col) => col.notNull())
      .addColumn("client_id", sql`varchar(191)`)
      .addColumn("sub", sql`varchar(255)`)
      .addColumn("constraints", sql`text`)
      .addColumn("single_use", sql`int`, (col) => col.notNull().defaultTo(0))
      .addColumn("used_at_ts", sql`bigint`)
      .addColumn("expires_at_ts", sql`bigint`)
      .addColumn("created_at_ts", sql`bigint`, (col) => col.notNull())
      .addColumn("revoked_at_ts", sql`bigint`)
      .addPrimaryKeyConstraint("client_registration_tokens_pk", ["id"]);
    if (sqlite) b = inlineForeignKeys(b, "client_registration_tokens");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("users")
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("email", sql`varchar(255)`)
      .addColumn("given_name", sql`varchar(255)`)
      .addColumn("family_name", sql`varchar(255)`)
      .addColumn("nickname", sql`varchar(255)`)
      .addColumn("name", sql`varchar(255)`)
      .addColumn("picture", sql`text`)
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("linked_to", sql`varchar(255)`)
      .addColumn("provider", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("connection", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("email_verified", sql`tinyint(1)`, (col) => col.notNull())
      .addColumn("is_social", sql`tinyint(1)`, (col) => col.notNull())
      .addColumn("app_metadata", sql`text`, (col) =>
        col.notNull().defaultTo(sql`('{}')`),
      )
      .addColumn("profileData", sql`text`)
      .addColumn("locale", sql`varchar(64)`)
      .addColumn("user_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("phone_number", sql`varchar(17)`)
      .addColumn("phone_verified", sql`tinyint(1)`)
      .addColumn("username", sql`varchar(128)`)
      .addColumn("user_metadata", sql`text`)
      .addColumn("middle_name", sql`varchar(100)`)
      .addColumn("profile", sql`text`)
      .addColumn("website", sql`text`)
      .addColumn("gender", sql`varchar(50)`)
      .addColumn("birthdate", sql`varchar(10)`)
      .addColumn("zoneinfo", sql`varchar(100)`)
      .addColumn("preferred_username", sql`varchar(255)`)
      .addColumn("address", sql`text`)
      .addColumn("registration_completed_at", sql`varchar(35)`)
      .addPrimaryKeyConstraint("users_pk", ["tenant_id", "user_id"]);
    if (sqlite) b = inlineForeignKeys(b, "users");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("codes")
      .addColumn("code_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("user_id", sql`varchar(255)`)
      .addColumn("login_id", sql`varchar(255)`)
      .addColumn("connection_id", sql`varchar(255)`)
      .addColumn("code_type", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("created_at", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("expires_at", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("used_at", sql`varchar(255)`)
      .addColumn("code_verifier", sql`varchar(128)`)
      .addColumn("code_challenge", sql`varchar(128)`)
      .addColumn("code_challenge_method", sql`varchar(5)`)
      .addColumn("redirect_uri", sql`varchar(1024)`)
      .addColumn("nonce", sql`varchar(1024)`)
      .addColumn("state", sql`varchar(2048)`)
      .addColumn("otp", sql`varchar(32)`)
      .addPrimaryKeyConstraint("codes_pk", [
        "code_id",
        "code_type",
        "tenant_id",
      ]);
    if (sqlite) b = inlineForeignKeys(b, "codes");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("connections")
      .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("response_type", sql`varchar(255)`)
      .addColumn("response_mode", sql`varchar(255)`)
      .addColumn("strategy", sql`varchar(64)`)
      .addColumn("options", sql`varchar(8192)`, (col) =>
        col.notNull().defaultTo("{}"),
      )
      .addColumn("created_at", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("display_name", sql`varchar(255)`)
      .addColumn("is_domain_connection", sql`int`)
      .addColumn("show_as_button", sql`int`)
      .addColumn("metadata", sql`varchar(4096)`)
      .addColumn("is_system", sql`int`, (col) => col.notNull().defaultTo(0))
      .addPrimaryKeyConstraint("connections_pk", ["tenant_id", "id"]);
    if (sqlite) b = inlineForeignKeys(b, "connections");
    await b.execute();
  }

  await db.schema
    .createTable("control_plane_comm_keys")
    .addColumn("kid", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("public_jwk", sql`text`, (col) => col.notNull())
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("revoked_at", sql`varchar(35)`)
    .addPrimaryKeyConstraint("control_plane_comm_keys_pk", ["kid"])
    .execute();

  {
    let b = db.schema
      .createTable("custom_domains")
      .addColumn("custom_domain_id", sql`varchar(256)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("domain", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("primary", sql`tinyint(1)`, (col) => col.notNull())
      .addColumn("status", sql`varchar(50)`, (col) => col.notNull())
      .addColumn("type", sql`varchar(50)`, (col) => col.notNull())
      .addColumn("origin_domain_name", sql`varchar(255)`)
      .addColumn("verification", sql`varchar(2048)`)
      .addColumn("custom_client_ip_header", sql`varchar(50)`)
      .addColumn("tls_policy", sql`varchar(50)`)
      .addColumn("domain_metadata", sql`varchar(2048)`)
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
      .addPrimaryKeyConstraint("custom_domains_pk", ["custom_domain_id"]);
    if (sqlite) b = inlineForeignKeys(b, "custom_domains");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("custom_text")
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("prompt", sql`varchar(64)`, (col) => col.notNull())
      .addColumn("language", sql`varchar(16)`, (col) => col.notNull())
      .addColumn("custom_text", sql`text`, (col) => col.notNull())
      .addColumn("created_at_ts", sql`bigint`, (col) => col.notNull())
      .addColumn("updated_at_ts", sql`bigint`, (col) => col.notNull())
      .addPrimaryKeyConstraint("custom_text_pk", [
        "tenant_id",
        "prompt",
        "language",
      ]);
    if (sqlite) b = inlineForeignKeys(b, "custom_text");
    await b.execute();
  }

  await db.schema
    .createTable("email_providers")
    .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("enabled", sql`tinyint(1)`, (col) => col.notNull())
    .addColumn("default_from_address", sql`varchar(255)`)
    .addColumn("credentials", sql`varchar(2048)`, (col) =>
      col.notNull().defaultTo("{}"),
    )
    .addColumn("settings", sql`varchar(2048)`, (col) =>
      col.notNull().defaultTo("{}"),
    )
    .addColumn("created_at", sql`varchar(29)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(29)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("email_providers_pk", ["tenant_id"])
    .execute();

  {
    let b = db.schema
      .createTable("email_templates")
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("template", sql`varchar(64)`, (col) => col.notNull())
      .addColumn("body", sql`text`, (col) => col.notNull())
      .addColumn("from", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("subject", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("syntax", sql`varchar(16)`, (col) =>
        col.notNull().defaultTo("liquid"),
      )
      .addColumn("result_url", sql`varchar(2048)`)
      .addColumn("url_lifetime_in_seconds", sql`int`)
      .addColumn("include_email_in_redirect", sql`int`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("enabled", sql`int`, (col) => col.notNull().defaultTo(1))
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
      .addPrimaryKeyConstraint("email_templates_pk", ["tenant_id", "template"]);
    if (sqlite) b = inlineForeignKeys(b, "email_templates");
    await b.execute();
  }

  await db.schema
    .createTable("flows")
    .addColumn("id", sql`varchar(24)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(150)`, (col) => col.notNull())
    .addColumn("actions", sql`text`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("flows_pk", ["id"])
    .execute();

  await db.schema
    .createTable("forms")
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("messages", sql`varchar(255)`)
    .addColumn("languages", sql`varchar(255)`)
    .addColumn("translations", sql`varchar(4096)`)
    .addColumn("nodes", sql`varchar(4096)`)
    .addColumn("start", sql`varchar(255)`)
    .addColumn("ending", sql`varchar(255)`)
    .addColumn("style", sql`varchar(1042)`)
    .addColumn("created_at", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(255)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("forms_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("grants")
      .addColumn("id", sql`varchar(21)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("user_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("client_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("audience", sql`varchar(100)`, (col) =>
        col.notNull().defaultTo(""),
      )
      .addColumn("scope", sql`text`, (col) => col.notNull())
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
      .addPrimaryKeyConstraint("grants_pk", ["id"]);
    if (sqlite) b = inlineForeignKeys(b, "grants");
    await b.execute();
  }

  await db.schema
    .createTable("hook_code")
    .addColumn("id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("code", sql`text`, (col) => col.notNull())
    .addColumn("secrets", sql`text`)
    .addColumn("created_at_ts", sql`bigint`, (col) => col.notNull())
    .addColumn("updated_at_ts", sql`bigint`, (col) => col.notNull())
    .addPrimaryKeyConstraint("hook_code_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("hooks")
      .addColumn("hook_id", sql`varchar(21)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("trigger_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("enabled", sql`tinyint(1)`, (col) => col.notNull())
      .addColumn("synchronous", sql`tinyint(1)`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("priority", sql`int`)
      .addColumn("form_id", sql`varchar(128)`)
      .addColumn("url", sql`varchar(512)`)
      .addColumn("template_id", sql`varchar(64)`)
      .addColumn("created_at_ts", sql`bigint`)
      .addColumn("updated_at_ts", sql`bigint`)
      .addColumn("code_id", sql`varchar(21)`)
      .addColumn("metadata", sql`text`)
      .addPrimaryKeyConstraint("hooks_pk", ["hook_id"]);
    if (sqlite) b = inlineForeignKeys(b, "hooks");
    await b.execute();
  }

  await db.schema
    .createTable("invites")
    .addColumn("id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("organization_id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("inviter", sql`text`, (col) => col.notNull())
    .addColumn("invitee", sql`text`, (col) => col.notNull())
    .addColumn("client_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("connection_id", sql`varchar(21)`)
    .addColumn("invitation_url", sql`text`, (col) => col.notNull())
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("expires_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("app_metadata", sql`text`)
    .addColumn("user_metadata", sql`text`)
    .addColumn("roles", sql`text`)
    .addColumn("ticket_id", sql`varchar(191)`)
    .addColumn("ttl_sec", sql`int`)
    .addColumn("send_invitation_email", sql`int`)
    .addPrimaryKeyConstraint("invites_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("keys")
      .addColumn("kid", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(255)`)
      .addColumn("created_at", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("revoked_at", sql`varchar(255)`)
      .addColumn("cert", sql`varchar(4096)`)
      .addColumn("pkcs7", sql`varchar(4096)`)
      .addColumn("fingerprint", sql`varchar(256)`)
      .addColumn("thumbprint", sql`varchar(256)`)
      .addColumn("current_since", sql`varchar(256)`)
      .addColumn("current_until", sql`varchar(256)`)
      .addColumn("type", sql`varchar(50)`, (col) =>
        col.notNull().defaultTo("jwt_signing"),
      )
      .addColumn("connection", sql`varchar(255)`)
      .addPrimaryKeyConstraint("keys_pk", ["kid"]);
    if (sqlite) b = inlineForeignKeys(b, "keys");
    await b.execute();
  }

  await db.schema
    .createTable("log_streams")
    .addColumn("id", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("type", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("status", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("sink", sql`text`, (col) => col.notNull())
    .addColumn("filters", sql`text`)
    .addColumn("is_priority", sql`tinyint(1)`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("log_streams_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("sessions")
      .addColumn("id", sql`varchar(26)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("user_id", sql`varchar(255)`)
      .addColumn("device", sql`text`, (col) => col.notNull())
      .addColumn("clients", sql`text`, (col) => col.notNull())
      .addColumn("login_session_id", sql`varchar(26)`)
      .addColumn("created_at_ts", sql`bigint`)
      .addColumn("updated_at_ts", sql`bigint`)
      .addColumn("expires_at_ts", sql`bigint`)
      .addColumn("idle_expires_at_ts", sql`bigint`)
      .addColumn("authenticated_at_ts", sql`bigint`)
      .addColumn("last_interaction_at_ts", sql`bigint`)
      .addColumn("used_at_ts", sql`bigint`)
      .addColumn("revoked_at_ts", sql`bigint`)
      .addPrimaryKeyConstraint("sessions_pk", ["tenant_id", "id"]);
    if (sqlite) b = inlineForeignKeys(b, "sessions");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("login_sessions")
      .addColumn("id", sql`varchar(26)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("session_id", sql`varchar(26)`)
      .addColumn("csrf_token", sql`varchar(26)`)
      .addColumn("authorization_url", sql`text`)
      .addColumn("ip", sql`varchar(39)`)
      .addColumn("useragent", sql`text`)
      .addColumn("auth0Client", sql`varchar(255)`)
      .addColumn("state", sql`varchar(50)`, (col) => col.defaultTo("pending"))
      .addColumn("state_data", sql`text`)
      .addColumn("failure_reason", sql`text`)
      .addColumn("user_id", sql`varchar(255)`)
      .addColumn("created_at_ts", sql`bigint`)
      .addColumn("updated_at_ts", sql`bigint`)
      .addColumn("expires_at_ts", sql`bigint`)
      .addColumn("auth_connection", sql`varchar(255)`)
      .addColumn("auth_strategy_strategy", sql`varchar(64)`)
      .addColumn("auth_strategy_strategy_type", sql`varchar(64)`)
      .addColumn("authenticated_at", sql`varchar(35)`)
      .addColumn("auth_params", sql`text`)
      .addPrimaryKeyConstraint("login_sessions_pk", ["tenant_id", "id"]);
    if (sqlite) b = inlineForeignKeys(b, "login_sessions");
    await b.execute();
  }

  await db.schema
    .createTable("logs")
    .addColumn("log_id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("category", sql`varchar(255)`)
    .addColumn("tenant_id", sql`varchar(64)`)
    .addColumn("user_id", sql`varchar(64)`)
    .addColumn("ip", sql`varchar(255)`)
    .addColumn("type", sql`varchar(8)`, (col) => col.notNull())
    .addColumn("date", sql`varchar(25)`, (col) => col.notNull())
    .addColumn("client_id", sql`varchar(255)`)
    .addColumn("client_name", sql`varchar(255)`)
    .addColumn("user_agent", sql`varchar(255)`)
    .addColumn("description", sql`varchar(255)`)
    .addColumn("details", sql`varchar(2048)`)
    .addColumn("isMobile", sql`int`)
    .addColumn("user_name", sql`varchar(255)`)
    .addColumn("connection", sql`varchar(255)`)
    .addColumn("connection_id", sql`varchar(255)`)
    .addColumn("audience", sql`varchar(255)`)
    .addColumn("scope", sql`varchar(255)`)
    .addColumn("strategy", sql`varchar(255)`)
    .addColumn("strategy_type", sql`varchar(255)`)
    .addColumn("hostname", sql`varchar(255)`)
    .addColumn("auth0_client", sql`varchar(8192)`)
    .addColumn("session_connection", sql`varchar(255)`)
    .addColumn("country_code", sql`varchar(2)`)
    .addColumn("country_code3", sql`varchar(3)`)
    .addColumn("country_name", sql`varchar(255)`)
    .addColumn("city_name", sql`varchar(255)`)
    .addColumn("latitude", sql`varchar(255)`)
    .addColumn("longitude", sql`varchar(255)`)
    .addColumn("time_zone", sql`varchar(255)`)
    .addColumn("continent_code", sql`varchar(2)`)
    .addPrimaryKeyConstraint("logs_pk", ["log_id"])
    .execute();

  await db.schema
    .createTable("migration_sources")
    .addColumn("id", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("provider", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("connection", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("enabled", sql`tinyint(1)`, (col) => col.notNull())
    .addColumn("credentials", sql`text`, (col) => col.notNull())
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("migration_sources_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("migrations")
      .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("provider", sql`varchar(255)`)
      .addColumn("client_id", sql`varchar(255)`)
      .addColumn("origin", sql`varchar(255)`)
      .addColumn("domain", sql`varchar(255)`)
      .addColumn("created_at", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(255)`, (col) => col.notNull())
      .addPrimaryKeyConstraint("migrations_pk", ["id"]);
    if (sqlite) b = inlineForeignKeys(b, "migrations");
    await b.execute();
  }

  await db.schema
    .createTable("organizations")
    .addColumn("id", sql`varchar(256)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(256)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(256)`, (col) => col.notNull())
    .addColumn("display_name", sql`varchar(256)`)
    .addColumn("branding", sql`text`)
    .addColumn("metadata", sql`text`)
    .addColumn("enabled_connections", sql`text`)
    .addColumn("token_quota", sql`text`)
    .addColumn("created_at", sql`varchar(256)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(256)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("organizations_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("organization_connections")
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("organization_id", sql`varchar(21)`, (col) => col.notNull())
      .addColumn("connection_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("assign_membership_on_login", sql`tinyint(1)`, (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("show_as_button", sql`tinyint(1)`, (col) =>
        col.notNull().defaultTo(1),
      )
      .addColumn("is_signup_enabled", sql`tinyint(1)`, (col) =>
        col.notNull().defaultTo(1),
      )
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull());
    if (sqlite) b = inlineForeignKeys(b, "organization_connections");
    await b.execute();
  }

  await db.schema
    .createTable("outbox_events")
    .addColumn("id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("event_type", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("log_type", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("aggregate_type", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("aggregate_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("payload", sql`text`, (col) => col.notNull())
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("processed_at", sql`varchar(35)`)
    .addColumn("retry_count", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("next_retry_at", sql`varchar(35)`)
    .addColumn("error", sql`text`)
    .addColumn("claimed_by", sql`varchar(64)`)
    .addColumn("claim_expires_at", sql`varchar(35)`)
    .addColumn("dead_lettered_at", sql`varchar(35)`)
    .addColumn("final_error", sql`text`)
    .addPrimaryKeyConstraint("outbox_events_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("passwords")
      .addColumn("id", sql`varchar(21)`, (col) => col.notNull())
      .addColumn("user_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("password", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("algorithm", sql`varchar(255)`, (col) =>
        col.notNull().defaultTo("bcrypt"),
      )
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("is_current", sql`int`, (col) => col.notNull().defaultTo(1))
      .addPrimaryKeyConstraint("passwords_pk", ["id"]);
    if (sqlite) b = inlineForeignKeys(b, "passwords");
    await b.execute();
  }

  await db.schema
    .createTable("prompt_settings")
    .addColumn("tenant_id", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("universal_login_experience", sql`varchar(16)`, (col) =>
      col.notNull().defaultTo("new"),
    )
    .addColumn("identifier_first", sql`tinyint(1)`, (col) =>
      col.notNull().defaultTo(1),
    )
    .addColumn("password_first", sql`tinyint(1)`, (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn("webauthn_platform_first_factor", sql`tinyint(1)`, (col) =>
      col.notNull().defaultTo(0),
    )
    .addPrimaryKeyConstraint("prompt_settings_pk", ["tenant_id"])
    .execute();

  await db.schema
    .createTable("proxy_routes")
    .addColumn("id", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("custom_domain_id", sql`varchar(256)`, (col) => col.notNull())
    .addColumn("priority", sql`int`, (col) => col.notNull().defaultTo(100))
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("match", sql`varchar(2048)`, (col) =>
      col.notNull().defaultTo('{"path":"/*"}'),
    )
    .addColumn("handlers", sql`text`, (col) => col.notNull())
    .addPrimaryKeyConstraint("proxy_routes_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("refresh_tokens")
      .addColumn("id", sql`varchar(26)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("client_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("user_id", sql`varchar(255)`)
      .addColumn("resource_servers", sql`text`, (col) => col.notNull())
      .addColumn("device", sql`text`, (col) => col.notNull())
      .addColumn("rotating", sql`tinyint(1)`, (col) => col.notNull())
      .addColumn("created_at_ts", sql`bigint`)
      .addColumn("expires_at_ts", sql`bigint`)
      .addColumn("idle_expires_at_ts", sql`bigint`)
      .addColumn("last_exchanged_at_ts", sql`bigint`)
      .addColumn("login_id", sql`varchar(26)`, (col) => col.notNull())
      .addColumn("revoked_at_ts", sql`bigint`)
      .addColumn("token_lookup", sql`varchar(16)`)
      .addColumn("token_hash", sql`varchar(64)`)
      .addColumn("family_id", sql`varchar(26)`)
      .addColumn("rotated_to", sql`varchar(26)`)
      .addColumn("rotated_at_ts", sql`bigint`)
      .addPrimaryKeyConstraint("refresh_tokens_pk", ["tenant_id", "id"]);
    if (sqlite) b = inlineForeignKeys(b, "refresh_tokens");
    await b.execute();
  }

  await db.schema
    .createTable("resource_servers")
    .addColumn("id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("identifier", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("scopes", sql`text`)
    .addColumn("signing_alg", sql`varchar(64)`)
    .addColumn("signing_secret", sql`varchar(2048)`)
    .addColumn("token_lifetime", sql`int`)
    .addColumn("token_lifetime_for_web", sql`int`)
    .addColumn("skip_consent_for_verifiable_first_party_clients", sql`int`)
    .addColumn("allow_offline_access", sql`int`)
    .addColumn("verification_key", sql`varchar(4096)`)
    .addColumn("options", sql`varchar(4096)`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("is_system", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("metadata", sql`varchar(4096)`)
    .addPrimaryKeyConstraint("resource_servers_pk", ["tenant_id", "id"])
    .execute();

  await db.schema
    .createTable("role_permissions")
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("role_id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("resource_server_identifier", sql`varchar(191)`, (col) =>
      col.notNull(),
    )
    .addColumn("permission_name", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("role_permissions_pk", [
      "tenant_id",
      "role_id",
      "resource_server_identifier",
      "permission_name",
    ])
    .execute();

  await db.schema
    .createTable("roles")
    .addColumn("id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(50)`, (col) => col.notNull())
    .addColumn("description", sql`varchar(255)`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("is_system", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("metadata", sql`varchar(4096)`)
    .addPrimaryKeyConstraint("roles_pk", ["tenant_id", "id"])
    .execute();

  await db.schema
    .createTable("rollouts")
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("kind", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("status", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("target_worker_version", sql`varchar(255)`)
    .addColumn("target_database_version", sql`varchar(255)`)
    .addColumn("wave_size", sql`int`, (col) => col.notNull().defaultTo(10))
    .addColumn("canary_tenant_ids", sql`text`)
    .addColumn("filter", sql`text`)
    .addColumn("initiated_by", sql`varchar(255)`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("finished_at", sql`varchar(35)`)
    .addPrimaryKeyConstraint("rollouts_pk", ["id"])
    .execute();

  await db.schema
    .createTable("tenant_operations")
    .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(255)`)
    .addColumn("rollout_id", sql`varchar(255)`)
    .addColumn("kind", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("status", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("current_step", sql`varchar(255)`)
    .addColumn("engine", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("engine_instance_id", sql`varchar(100)`)
    .addColumn("target_worker_version", sql`varchar(255)`)
    .addColumn("target_database_version", sql`varchar(255)`)
    .addColumn("error", sql`text`)
    .addColumn("initiated_by", sql`varchar(255)`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("finished_at", sql`varchar(35)`)
    .addPrimaryKeyConstraint("tenant_operations_pk", ["id"])
    .execute();

  {
    let b = db.schema
      .createTable("tenant_operation_events")
      .addColumn("id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("operation_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("step", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("outcome", sql`varchar(32)`, (col) => col.notNull())
      .addColumn("detail", sql`text`)
      .addColumn("attempt", sql`int`, (col) => col.notNull().defaultTo(1))
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addPrimaryKeyConstraint("tenant_operation_events_pk", ["id"]);
    if (sqlite) b = inlineForeignKeys(b, "tenant_operation_events");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("themes")
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("themeId", sql`varchar(21)`, (col) => col.notNull())
      .addColumn("displayName", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("colors_primary_button_label", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_primary_button", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_secondary_button_border", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_secondary_button_label", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_base_focus_color", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_base_hover_color", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_body_text", sql`varchar(24)`, (col) => col.notNull())
      .addColumn("colors_captcha_widget_theme", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_error", sql`varchar(24)`, (col) => col.notNull())
      .addColumn("colors_header", sql`varchar(24)`, (col) => col.notNull())
      .addColumn("colors_icons", sql`varchar(24)`, (col) => col.notNull())
      .addColumn("colors_input_background", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_input_border", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_input_filled_text", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_input_labels_placeholders", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_links_focused_components", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_success", sql`varchar(24)`, (col) => col.notNull())
      .addColumn("colors_widget_background", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("colors_widget_border", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_button_border_radius", sql`int`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_button_border_weight", sql`int`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_buttons_style", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_input_border_radius", sql`int`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_input_border_weight", sql`int`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_inputs_style", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_show_widget_shadow", sql`tinyint(1)`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_widget_border_weight", sql`int`, (col) =>
        col.notNull(),
      )
      .addColumn("borders_widget_corner_radius", sql`int`, (col) =>
        col.notNull(),
      )
      .addColumn("fonts_body_text_bold", sql`int`, (col) => col.notNull())
      .addColumn("fonts_body_text_size", sql`int`, (col) => col.notNull())
      .addColumn("fonts_buttons_text_bold", sql`int`, (col) => col.notNull())
      .addColumn("fonts_buttons_text_size", sql`int`, (col) => col.notNull())
      .addColumn("fonts_font_url", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("fonts_input_labels_bold", sql`int`, (col) => col.notNull())
      .addColumn("fonts_input_labels_size", sql`int`, (col) => col.notNull())
      .addColumn("fonts_links_bold", sql`tinyint(1)`, (col) => col.notNull())
      .addColumn("fonts_links_size", sql`int`, (col) => col.notNull())
      .addColumn("fonts_links_style", sql`varchar(24)`, (col) => col.notNull())
      .addColumn("fonts_reference_text_size", sql`int`, (col) => col.notNull())
      .addColumn("fonts_subtitle_bold", sql`tinyint(1)`, (col) => col.notNull())
      .addColumn("fonts_subtitle_size", sql`int`, (col) => col.notNull())
      .addColumn("fonts_title_bold", sql`tinyint(1)`, (col) => col.notNull())
      .addColumn("fonts_title_size", sql`int`, (col) => col.notNull())
      .addColumn("page_background_background_color", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn(
        "page_background_background_image_url",
        sql`varchar(255)`,
        (col) => col.notNull(),
      )
      .addColumn("page_background_page_layout", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("widget_header_text_alignment", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("widget_logo_height", sql`int`, (col) => col.notNull())
      .addColumn("widget_logo_position", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("widget_logo_url", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("widget_social_buttons_layout", sql`varchar(24)`, (col) =>
        col.notNull(),
      )
      .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
      .addPrimaryKeyConstraint("themes_pk", ["tenant_id", "themeId"]);
    if (sqlite) b = inlineForeignKeys(b, "themes");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("universal_login_templates")
      .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
      .addColumn("body", sql`text`, (col) => col.notNull())
      .addColumn("updated_at_ts", sql`bigint`, (col) => col.notNull())
      .addColumn("created_at_ts", sql`bigint`, (col) => col.notNull())
      .addPrimaryKeyConstraint("universal_login_templates_pk", ["tenant_id"]);
    if (sqlite) b = inlineForeignKeys(b, "universal_login_templates");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("user_activity")
      .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("user_id", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("last_login", sql`varchar(35)`)
      .addColumn("last_ip", sql`varchar(45)`)
      .addColumn("login_count", sql`int`, (col) => col.notNull().defaultTo(0))
      .addColumn("failed_logins", sql`text`)
      .addColumn("last_password_reset", sql`varchar(35)`)
      .addPrimaryKeyConstraint("user_activity_pk", ["tenant_id", "user_id"]);
    if (sqlite) b = inlineForeignKeys(b, "user_activity");
    await b.execute();
  }

  {
    let b = db.schema
      .createTable("user_organizations")
      .addColumn("id", sql`varchar(256)`, (col) => col.notNull())
      .addColumn("tenant_id", sql`varchar(256)`, (col) => col.notNull())
      .addColumn("user_id", sql`varchar(256)`, (col) => col.notNull())
      .addColumn("organization_id", sql`varchar(256)`, (col) => col.notNull())
      .addColumn("created_at", sql`varchar(256)`, (col) => col.notNull())
      .addColumn("updated_at", sql`varchar(256)`, (col) => col.notNull())
      .addPrimaryKeyConstraint("user_organizations_pk", ["id"]);
    if (sqlite) b = inlineForeignKeys(b, "user_organizations");
    await b.execute();
  }

  await db.schema
    .createTable("user_permissions")
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("user_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("resource_server_identifier", sql`varchar(100)`, (col) =>
      col.notNull(),
    )
    .addColumn("permission_name", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("organization_id", sql`varchar(21)`, (col) =>
      col.notNull().defaultTo(""),
    )
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("user_permissions_pk", [
      "tenant_id",
      "user_id",
      "resource_server_identifier",
      "permission_name",
      "organization_id",
    ])
    .execute();

  await db.schema
    .createTable("user_roles")
    .addColumn("tenant_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("user_id", sql`varchar(191)`, (col) => col.notNull())
    .addColumn("role_id", sql`varchar(21)`, (col) => col.notNull())
    .addColumn("organization_id", sql`varchar(191)`, (col) =>
      col.notNull().defaultTo(""),
    )
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("user_roles_pk", [
      "tenant_id",
      "user_id",
      "role_id",
      "organization_id",
    ])
    .execute();

  await db.schema
    .createIndex("idx_action_executions_tenant")
    .on("action_executions")
    .columns(["tenant_id", "id"])
    .execute();

  await db.schema
    .createIndex("idx_action_versions_action")
    .on("action_versions")
    .columns(["tenant_id", "action_id"])
    .execute();

  await db.schema
    .createIndex("uniq_action_versions_action_number")
    .on("action_versions")
    .columns(["tenant_id", "action_id", "number"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_actions_tenant")
    .on("actions")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .createIndex("authentication_methods_credential_id_idx")
    .on("authentication_methods")
    .columns(["credential_id"])
    .execute();

  await db.schema
    .createIndex("mfa_enrollments_tenant_user_idx")
    .on("authentication_methods")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("idx_client_grants_audience")
    .on("client_grants")
    .columns(["audience"])
    .execute();

  await db.schema
    .createIndex("uq_client_grants_tenant_client_audience")
    .on("client_grants")
    .columns(["tenant_id", "client_id", "audience"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_client_registration_tokens_client")
    .on("client_registration_tokens")
    .columns(["tenant_id", "client_id"])
    .execute();

  await db.schema
    .createIndex("idx_client_registration_tokens_hash")
    .on("client_registration_tokens")
    .columns(["tenant_id", "token_hash"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_clients_owner_user_id")
    .on("clients")
    .columns(["tenant_id", "owner_user_id"])
    .execute();

  await db.schema
    .createIndex("control_plane_comm_keys_tenant_id_created_at_idx")
    .on("control_plane_comm_keys")
    .columns(["tenant_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("flows_tenant_id_idx")
    .on("flows")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .createIndex("forms_tenant_id_idx")
    .on("forms")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .createIndex("grants_natural_key_idx")
    .on("grants")
    .columns(["tenant_id", "user_id", "client_id", "audience"])
    .unique()
    .execute();

  await db.schema
    .createIndex("grants_tenant_user_idx")
    .on("grants")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("idx_hook_code_tenant")
    .on("hook_code")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .createIndex("idx_invites_expires_at")
    .on("invites")
    .columns(["expires_at"])
    .execute();

  await db.schema
    .createIndex("idx_invites_organization_id")
    .on("invites")
    .columns(["organization_id"])
    .execute();

  await db.schema
    .createIndex("idx_invites_tenant_created")
    .on("invites")
    .columns(["tenant_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_log_streams_tenant_id")
    .on("log_streams")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .createIndex("idx_login_sessions_expires_at_ts")
    .on("login_sessions")
    .columns(["expires_at_ts"])
    .execute();

  await db.schema
    .createIndex("login_sessions_id_index")
    .on("login_sessions")
    .columns(["id"])
    .execute();

  await db.schema
    .createIndex("login_sessions_state_idx")
    .on("login_sessions")
    .columns(["state"])
    .execute();

  await db.schema
    .createIndex("login_sessions_state_updated_idx")
    .on("login_sessions")
    .columns(["state"])
    .execute();

  await db.schema
    .createIndex("login_sessions_tenant_user_idx")
    .on("login_sessions")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("logs_date")
    .on("logs")
    .columns(["date"])
    .execute();

  await db.schema
    .createIndex("logs_tenant_id")
    .on("logs")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .createIndex("logs_user_id")
    .on("logs")
    .columns(["user_id"])
    .execute();

  await db.schema
    .createIndex("idx_migration_sources_tenant_id")
    .on("migration_sources")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .createIndex("idx_organization_connections_tenant_connection")
    .on("organization_connections")
    .columns(["tenant_id", "connection_id"])
    .execute();

  await db.schema
    .createIndex("idx_organization_connections_tenant_org")
    .on("organization_connections")
    .columns(["tenant_id", "organization_id"])
    .execute();

  await db.schema
    .createIndex("organization_connections_unique")
    .on("organization_connections")
    .columns(["tenant_id", "organization_id", "connection_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_organizations_tenant_name_unique")
    .on("organizations")
    .columns(["tenant_id", "name"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_outbox_claim")
    .on("outbox_events")
    .columns([
      "processed_at",
      "claim_expires_at",
      "next_retry_at",
      "created_at",
    ])
    .execute();

  await db.schema
    .createIndex("idx_outbox_events_tenant_dead_lettered")
    .on("outbox_events")
    .columns(["tenant_id", "dead_lettered_at"])
    .execute();

  await db.schema
    .createIndex("idx_outbox_tenant_type")
    .on("outbox_events")
    .columns(["tenant_id", "event_type", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_outbox_unprocessed")
    .on("outbox_events")
    .columns(["processed_at", "created_at"])
    .execute();

  await db.schema
    .createIndex("proxy_routes_custom_domain_id_idx")
    .on("proxy_routes")
    .columns(["custom_domain_id"])
    .execute();

  await db.schema
    .createIndex("proxy_routes_tenant_id_idx")
    .on("proxy_routes")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .createIndex("idx_refresh_tokens_expires_at_ts")
    .on("refresh_tokens")
    .columns(["expires_at_ts"])
    .execute();

  await db.schema
    .createIndex("idx_refresh_tokens_family_id")
    .on("refresh_tokens")
    .columns(["tenant_id", "family_id"])
    .execute();

  await db.schema
    .createIndex("idx_refresh_tokens_idle_expires_at_ts")
    .on("refresh_tokens")
    .columns(["idle_expires_at_ts"])
    .execute();

  await db.schema
    .createIndex("idx_refresh_tokens_login_id")
    .on("refresh_tokens")
    .columns(["login_id"])
    .execute();

  await db.schema
    .createIndex("idx_refresh_tokens_token_lookup")
    .on("refresh_tokens")
    .columns(["tenant_id", "token_lookup"])
    .execute();

  await db.schema
    .createIndex("idx_refresh_tokens_user_id")
    .on("refresh_tokens")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("resource_servers_tenant_identifier_uq")
    .on("resource_servers")
    .columns(["tenant_id", "identifier"])
    .unique()
    .execute();

  await db.schema
    .createIndex("role_permissions_permission_fk")
    .on("role_permissions")
    .columns(["tenant_id", "resource_server_identifier", "permission_name"])
    .execute();

  await db.schema
    .createIndex("roles_tenant_name_uq")
    .on("roles")
    .columns(["tenant_id", "name"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_sessions_expires_at_ts")
    .on("sessions")
    .columns(["expires_at_ts"])
    .execute();

  await db.schema
    .createIndex("idx_sessions_idle_expires_at_ts")
    .on("sessions")
    .columns(["idle_expires_at_ts"])
    .execute();

  await db.schema
    .createIndex("idx_sessions_user_id")
    .on("sessions")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("tenant_operation_events_operation_id_created_at_idx")
    .on("tenant_operation_events")
    .columns(["operation_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("tenant_operations_rollout_id_idx")
    .on("tenant_operations")
    .columns(["rollout_id"])
    .execute();

  await db.schema
    .createIndex("tenant_operations_status_idx")
    .on("tenant_operations")
    .columns(["status"])
    .execute();

  await db.schema
    .createIndex("tenant_operations_tenant_id_created_at_idx")
    .on("tenant_operations")
    .columns(["tenant_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_user_organizations_organization_id")
    .on("user_organizations")
    .columns(["organization_id"])
    .execute();

  await db.schema
    .createIndex("idx_user_organizations_unique")
    .on("user_organizations")
    .columns(["tenant_id", "user_id", "organization_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_user_organizations_user_id")
    .on("user_organizations")
    .columns(["user_id"])
    .execute();

  await db.schema
    .createIndex("user_permissions_organization_fk")
    .on("user_permissions")
    .columns(["organization_id"])
    .execute();

  await db.schema
    .createIndex("user_permissions_permission_fk")
    .on("user_permissions")
    .columns(["tenant_id", "resource_server_identifier", "permission_name"])
    .execute();

  await db.schema
    .createIndex("user_permissions_user_fk")
    .on("user_permissions")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("user_roles_organization_fk")
    .on("user_roles")
    .columns(["organization_id"])
    .execute();

  await db.schema
    .createIndex("user_roles_role_fk")
    .on("user_roles")
    .columns(["tenant_id", "role_id"])
    .execute();

  await db.schema
    .createIndex("user_roles_user_fk")
    .on("user_roles")
    .columns(["tenant_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("unique_email_provider")
    .on("users")
    .columns(["email", "provider", "tenant_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("unique_username_provider")
    .on("users")
    .columns(["username", "provider", "tenant_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("users_linked_to_index")
    .on("users")
    .columns(["linked_to"])
    .execute();

  await db.schema
    .createIndex("users_name_index")
    .on("users")
    .columns(["name"])
    .execute();

  await db.schema
    .createIndex("users_phone_tenant_provider_index")
    .on("users")
    .columns(["tenant_id", "phone_number", "provider"])
    .execute();

  await db.schema
    .createIndex("users_user_id_tenant_id")
    .on("users")
    .columns(["user_id", "tenant_id"])
    .execute();

  // MySQL creates these itself as the backing index for the matching
  // foreign key below; SQLite does not, so it states them explicitly.
  if (sqlite) {
    await db.schema
      .createIndex("FK_codes_user_id_tenant_id_constraint")
      .on("codes")
      .columns(["user_id", "tenant_id"])
      .execute();

    await db.schema
      .createIndex("grants_user_id_constraint")
      .on("grants")
      .columns(["user_id", "tenant_id"])
      .execute();

    await db.schema
      .createIndex("login_sessions_session_fk")
      .on("login_sessions")
      .columns(["tenant_id", "session_id"])
      .execute();

    await db.schema
      .createIndex("organization_connections_organization_fk")
      .on("organization_connections")
      .columns(["organization_id"])
      .execute();

    await db.schema
      .createIndex("password_history_user_id_tenant_id_constraint")
      .on("passwords")
      .columns(["user_id", "tenant_id"])
      .execute();

    await db.schema
      .createIndex("refresh_tokens_client_fk")
      .on("refresh_tokens")
      .columns(["tenant_id", "client_id"])
      .execute();

    await db.schema
      .createIndex("sessions_user_fk")
      .on("sessions")
      .columns(["user_id", "tenant_id"])
      .execute();

    await db.schema
      .createIndex("user_activity_user_id_constraint")
      .on("user_activity")
      .columns(["user_id", "tenant_id"])
      .execute();
  }

  if (!sqlite) {
    for (const fk of FOREIGN_KEYS) {
      await db.schema
        .alterTable(fk.table)
        .addForeignKeyConstraint(
          fk.name,
          fk.columns,
          fk.references,
          fk.referencedColumns,
          (cb) => {
            let c = cb;
            if (fk.onDelete) c = c.onDelete(fk.onDelete as never);
            if (fk.onUpdate) c = c.onUpdate(fk.onUpdate as never);
            return c;
          },
        )
        .execute();
    }
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("user_roles").ifExists().execute();
  await db.schema.dropTable("user_permissions").ifExists().execute();
  await db.schema.dropTable("user_organizations").ifExists().execute();
  await db.schema.dropTable("user_activity").ifExists().execute();
  await db.schema.dropTable("universal_login_templates").ifExists().execute();
  await db.schema.dropTable("themes").ifExists().execute();
  await db.schema.dropTable("tenant_operation_events").ifExists().execute();
  await db.schema.dropTable("tenant_operations").ifExists().execute();
  await db.schema.dropTable("rollouts").ifExists().execute();
  await db.schema.dropTable("roles").ifExists().execute();
  await db.schema.dropTable("role_permissions").ifExists().execute();
  await db.schema.dropTable("resource_servers").ifExists().execute();
  await db.schema.dropTable("refresh_tokens").ifExists().execute();
  await db.schema.dropTable("proxy_routes").ifExists().execute();
  await db.schema.dropTable("prompt_settings").ifExists().execute();
  await db.schema.dropTable("passwords").ifExists().execute();
  await db.schema.dropTable("outbox_events").ifExists().execute();
  await db.schema.dropTable("organization_connections").ifExists().execute();
  await db.schema.dropTable("organizations").ifExists().execute();
  await db.schema.dropTable("migrations").ifExists().execute();
  await db.schema.dropTable("migration_sources").ifExists().execute();
  await db.schema.dropTable("logs").ifExists().execute();
  await db.schema.dropTable("login_sessions").ifExists().execute();
  await db.schema.dropTable("sessions").ifExists().execute();
  await db.schema.dropTable("log_streams").ifExists().execute();
  await db.schema.dropTable("keys").ifExists().execute();
  await db.schema.dropTable("invites").ifExists().execute();
  await db.schema.dropTable("hooks").ifExists().execute();
  await db.schema.dropTable("hook_code").ifExists().execute();
  await db.schema.dropTable("grants").ifExists().execute();
  await db.schema.dropTable("forms").ifExists().execute();
  await db.schema.dropTable("flows").ifExists().execute();
  await db.schema.dropTable("email_templates").ifExists().execute();
  await db.schema.dropTable("email_providers").ifExists().execute();
  await db.schema.dropTable("custom_text").ifExists().execute();
  await db.schema.dropTable("custom_domains").ifExists().execute();
  await db.schema.dropTable("control_plane_comm_keys").ifExists().execute();
  await db.schema.dropTable("connections").ifExists().execute();
  await db.schema.dropTable("codes").ifExists().execute();
  await db.schema.dropTable("users").ifExists().execute();
  await db.schema.dropTable("client_registration_tokens").ifExists().execute();
  await db.schema.dropTable("client_grants").ifExists().execute();
  await db.schema.dropTable("clients").ifExists().execute();
  await db.schema.dropTable("branding").ifExists().execute();
  await db.schema.dropTable("authentication_methods").ifExists().execute();
  await db.schema.dropTable("actions").ifExists().execute();
  await db.schema.dropTable("action_versions").ifExists().execute();
  await db.schema.dropTable("action_executions").ifExists().execute();
  await db.schema.dropTable("tenants").ifExists().execute();
}
