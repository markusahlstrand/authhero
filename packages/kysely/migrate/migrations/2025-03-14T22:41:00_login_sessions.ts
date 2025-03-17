import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add a new login sessions table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("login_sessions")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("session_id", "varchar(21)", (col) =>
      col.references("sessions.id").onDelete("cascade"),
    )
    .addColumn("csrf_token", "varchar(21)", (col) => col.notNull())
    .addColumn("authParams_client_id", "varchar(255)", (col) => col.notNull())
    .addColumn("authParams_vendor_id", "varchar(255)")
    .addColumn("authParams_username", "varchar(255)")
    .addColumn("authParams_response_type", "varchar(255)")
    .addColumn("authParams_response_mode", "varchar(255)")
    .addColumn("authParams_audience", "varchar(255)")
    .addColumn("authParams_scope", "varchar(511)")
    .addColumn("authParams_state", "varchar(511)")
    .addColumn("authParams_code_challenge_method", "varchar(256)")
    .addColumn("authParams_code_challenge", "varchar(256)")
    .addColumn("authParams_redirect_uri", "varchar(256)")
    .addColumn("authParams_organization", "varchar(256)")
    .addColumn("authorization_url", "varchar(1024)")
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)", (col) => col.notNull())
    .addColumn("ip", "varchar(39)")
    .addColumn("useragent", "varchar(1024)")
    .execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("login_sessions").execute();
}
