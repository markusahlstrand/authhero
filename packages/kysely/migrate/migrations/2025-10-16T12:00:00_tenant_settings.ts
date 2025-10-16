import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("tenant_settings")
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull().primaryKey(),
    )
    .addColumn("idle_session_lifetime", "integer")
    .addColumn("session_lifetime", "integer")
    .addColumn("session_cookie", "text") // JSON
    .addColumn("enable_client_connections", "integer") // boolean as int
    .addColumn("default_redirection_uri", "text")
    .addColumn("enabled_locales", "text") // JSON array
    .addColumn("default_directory", "varchar(255)")
    .addColumn("error_page", "text") // JSON
    .addColumn("flags", "text") // JSON
    .addColumn("friendly_name", "varchar(255)")
    .addColumn("picture_url", "text")
    .addColumn("support_email", "varchar(255)")
    .addColumn("support_url", "text")
    .addColumn("sandbox_version", "varchar(50)")
    .addColumn("sandbox_versions_available", "text") // JSON array
    .addColumn("change_password", "text") // JSON
    .addColumn("guardian_mfa_page", "text") // JSON
    .addColumn("default_audience", "varchar(255)")
    .addColumn("default_organization", "varchar(255)")
    .addColumn("sessions", "text") // JSON
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("tenant_settings").execute();
}
