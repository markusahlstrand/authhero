import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
export async function up(db: Kysely<Database>): Promise<void> {
  // Add all tenant_settings columns to tenants table (one at a time for SQLite)
  await db.schema
    .alterTable("tenants")
    .addColumn("idle_session_lifetime", "integer")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("session_lifetime", "integer")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("session_cookie", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("allowed_logout_urls", "text") // JSON array
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("ephemeral_session_lifetime", "integer")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("idle_ephemeral_session_lifetime", "integer")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("default_redirection_uri", "text")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("enabled_locales", "text") // JSON array
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("default_directory", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("error_page", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("flags", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("friendly_name", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("picture_url", "text")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("support_email", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("sandbox_version", "varchar(50)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("sandbox_versions_available", "text") // JSON array
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("legacy_sandbox_version", "varchar(50)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("change_password", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("guardian_mfa_page", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("device_flow", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("default_token_quota", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("default_audience", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("default_organization", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("sessions", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("oidc_logout", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("allow_organization_name_in_authentication_api", "integer") // boolean as int
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("customize_mfa_in_postlogin_action", "integer") // boolean as int
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("acr_values_supported", "text") // JSON array
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("mtls", "text") // JSON
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("pushed_authorization_requests_supported", "integer") // boolean as int
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("authorization_response_iss_parameter_supported", "integer") // boolean as int
    .execute();

  // Copy name to friendly_name for all tenants (before we drop the name column)
  await db
    .updateTable("tenants")
    .set({
      friendly_name: sql`name`,
    })
    .execute();

  // Remove deprecated columns from tenants table
  await db.schema.alterTable("tenants").dropColumn("language").execute();

  await db.schema.alterTable("tenants").dropColumn("logo").execute();

  await db.schema.alterTable("tenants").dropColumn("primary_color").execute();

  await db.schema.alterTable("tenants").dropColumn("secondary_color").execute();

  await db.schema.alterTable("tenants").dropColumn("name").execute();

  // Migrate any existing data from tenant_settings to tenants
  // (This query will only work if there's data in tenant_settings)
  const hasData = await (db as any)
    .selectFrom("tenant_settings")
    .select("tenant_id")
    .limit(1)
    .execute();

  if (hasData.length > 0) {
    // Get all settings
    const allSettings = await (db as any)
      .selectFrom("tenant_settings")
      .selectAll()
      .execute();

    // Update each tenant with its settings
    for (const settings of allSettings) {
      await (db as any)
        .updateTable("tenants")
        .set({
          idle_session_lifetime: settings.idle_session_lifetime,
          session_lifetime: settings.session_lifetime,
          session_cookie: settings.session_cookie,
          enable_client_connections: settings.enable_client_connections,
          default_redirection_uri: settings.default_redirection_uri,
          enabled_locales: settings.enabled_locales,
          default_directory: settings.default_directory,
          error_page: settings.error_page,
          flags: settings.flags,
          friendly_name: settings.friendly_name,
          picture_url: settings.picture_url,
          support_email: settings.support_email,
          support_url: settings.support_url,
          sandbox_version: settings.sandbox_version,
          sandbox_versions_available: settings.sandbox_versions_available,
          change_password: settings.change_password,
          guardian_mfa_page: settings.guardian_mfa_page,
          default_audience: settings.default_audience,
          default_organization: settings.default_organization,
          sessions: settings.sessions,
        })
        .where("id", "=", settings.tenant_id)
        .execute();
    }
  }

  // Drop the tenant_settings table
  await db.schema.dropTable("tenant_settings").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Recreate tenant_settings table
  await db.schema
    .createTable("tenant_settings")
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull().primaryKey(),
    )
    .addColumn("idle_session_lifetime", "integer")
    .addColumn("session_lifetime", "integer")
    .addColumn("session_cookie", "text")
    .addColumn("enable_client_connections", "integer")
    .addColumn("default_redirection_uri", "text")
    .addColumn("enabled_locales", "text")
    .addColumn("default_directory", "varchar(255)")
    .addColumn("error_page", "text")
    .addColumn("flags", "text")
    .addColumn("friendly_name", "varchar(255)")
    .addColumn("picture_url", "text")
    .addColumn("support_email", "varchar(255)")
    .addColumn("support_url", "text")
    .addColumn("sandbox_version", "varchar(50)")
    .addColumn("sandbox_versions_available", "text")
    .addColumn("change_password", "text")
    .addColumn("guardian_mfa_page", "text")
    .addColumn("default_audience", "varchar(255)")
    .addColumn("default_organization", "varchar(255)")
    .addColumn("sessions", "text")
    .execute();

  // Migrate data back from tenants to tenant_settings
  const allTenants = await (db as any)
    .selectFrom("tenants")
    .select([
      "id",
      "idle_session_lifetime",
      "session_lifetime",
      "session_cookie",
      "enable_client_connections",
      "default_redirection_uri",
      "enabled_locales",
      "default_directory",
      "error_page",
      "flags",
      "friendly_name",
      "picture_url",
      "support_email",
      "support_url",
      "sandbox_version",
      "sandbox_versions_available",
      "change_password",
      "guardian_mfa_page",
      "default_audience",
      "default_organization",
      "sessions",
    ])
    .execute();

  for (const tenant of allTenants) {
    // Only insert if at least one settings field is not null
    const hasSettings =
      tenant.idle_session_lifetime !== null ||
      tenant.session_lifetime !== null ||
      tenant.session_cookie !== null ||
      tenant.enable_client_connections !== null ||
      tenant.default_redirection_uri !== null ||
      tenant.enabled_locales !== null ||
      tenant.default_directory !== null ||
      tenant.error_page !== null ||
      tenant.flags !== null ||
      tenant.friendly_name !== null ||
      tenant.picture_url !== null ||
      tenant.support_email !== null ||
      tenant.support_url !== null ||
      tenant.sandbox_version !== null ||
      tenant.sandbox_versions_available !== null ||
      tenant.change_password !== null ||
      tenant.guardian_mfa_page !== null ||
      tenant.default_audience !== null ||
      tenant.default_organization !== null ||
      tenant.sessions !== null;

    if (hasSettings) {
      await (db as any)
        .insertInto("tenant_settings")
        .values({
          tenant_id: tenant.id,
          idle_session_lifetime: tenant.idle_session_lifetime,
          session_lifetime: tenant.session_lifetime,
          session_cookie: tenant.session_cookie,
          enable_client_connections: tenant.enable_client_connections,
          default_redirection_uri: tenant.default_redirection_uri,
          enabled_locales: tenant.enabled_locales,
          default_directory: tenant.default_directory,
          error_page: tenant.error_page,
          flags: tenant.flags,
          friendly_name: tenant.friendly_name,
          picture_url: tenant.picture_url,
          support_email: tenant.support_email,
          support_url: tenant.support_url,
          sandbox_version: tenant.sandbox_version,
          sandbox_versions_available: tenant.sandbox_versions_available,
          change_password: tenant.change_password,
          guardian_mfa_page: tenant.guardian_mfa_page,
          default_audience: tenant.default_audience,
          default_organization: tenant.default_organization,
          sessions: tenant.sessions,
        })
        .execute();
    }
  }

  // Remove columns from tenants table
  await db.schema
    .alterTable("tenants")
    .dropColumn("idle_session_lifetime")
    .dropColumn("session_lifetime")
    .dropColumn("session_cookie")
    .dropColumn("enable_client_connections")
    .dropColumn("default_redirection_uri")
    .dropColumn("enabled_locales")
    .dropColumn("default_directory")
    .dropColumn("error_page")
    .dropColumn("flags")
    .dropColumn("friendly_name")
    .dropColumn("picture_url")
    .dropColumn("support_email")
    .dropColumn("sandbox_version")
    .dropColumn("sandbox_versions_available")
    .dropColumn("change_password")
    .dropColumn("guardian_mfa_page")
    .dropColumn("default_audience")
    .dropColumn("default_organization")
    .dropColumn("sessions")
    .execute();

  // Re-add the deprecated columns
  await db.schema
    .alterTable("tenants")
    .addColumn("name", "varchar(255)")
    .execute();

  // Copy friendly_name back to name
  await (db as any)
    .updateTable("tenants")
    .set({
      name: sql`COALESCE(friendly_name, id)`,
    })
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("language", "varchar(255)")
    .execute();

  await db.schema.alterTable("tenants").addColumn("logo", "text").execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("primary_color", "varchar(50)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("secondary_color", "varchar(50)")
    .execute();
}
