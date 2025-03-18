import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add a new login sessions table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("sessions")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)")
    .addColumn("user_id", "varchar(255)")
    // same change here as on other tables - FK reference needed to users table
    .addForeignKeyConstraint(
      "sessions_user_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)")
    .addColumn("idle_expires_at", "varchar(35)")
    .addColumn("authenticated_at", "varchar(35)")
    .addColumn("last_interaction_at", "varchar(35)")
    .addColumn("used_at", "varchar(35)")
    .addColumn("revoked_at", "varchar(35)")
    // Contains a json blob with user agents.
    .addColumn("device", "varchar(2048)", (col) => col.notNull())
    // Contains a json array with client ids.
    .addColumn("clients", "varchar(1024)", (col) => col.notNull())
    .execute();

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
    .addColumn("authParams_state", "varchar(2048)")
    .addColumn("authParams_nonce", "varchar(255)")
    .addColumn("authParams_code_challenge_method", "varchar(255)")
    .addColumn("authParams_code_challenge", "varchar(255)")
    .addColumn("authParams_redirect_uri", "varchar(255)")
    .addColumn("authParams_organization", "varchar(255)")
    .addColumn("authParams_prompt", "varchar(32)")
    .addColumn("authParams_act_as", "varchar(256)")
    .addColumn("authParams_ui_locales", "varchar(32)")
    .addColumn("authorization_url", "varchar(1024)")
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)", (col) => col.notNull())
    .addColumn("ip", "varchar(39)")
    .addColumn("useragent", "varchar(1024)")
    .addColumn("auth0Client", "varchar(255)")
    .execute();

  await db.schema
    .createTable("refresh_tokens")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("client_id", "varchar(21)", (col) =>
      col.references("applications.id").onDelete("cascade").notNull(),
    )
    .addColumn("tenant_id", "varchar(255)")
    // this is not a foreign key as the session could expire and be deleted
    .addColumn("session_id", "varchar(21)", (col) => col.notNull())
    .addColumn("user_id", "varchar(255)")
    // same change here as on other tables - FK reference needed to users table
    .addForeignKeyConstraint(
      "refresh_tokens_user_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)")
    .addColumn("idle_expires_at", "varchar(35)")
    .addColumn("last_exchanged_at", "varchar(35)")
    // Contains a json blob with user agents.
    .addColumn("device", "varchar(2048)", (col) => col.notNull())
    // Contains a json blob with user agents.
    .addColumn("resource_servers", "varchar(2048)", (col) => col.notNull())
    .addColumn("rotating", "boolean", (col) => col.notNull())
    .execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("sessions").execute();
  await db.schema.dropTable("login_sessions").execute();
  await db.schema.dropTable("refresh_tokens").execute();
}
