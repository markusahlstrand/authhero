import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Updates foreign key constraints to reference the new clients table
 * instead of the applications table.
 * Uses SQLite-compatible approach by recreating tables to preserve data.
 *
 * Also takes the opportunity to:
 * - Add composite primary keys (tenant_id, id) to improve multi-tenant performance
 * - Upgrade problematic varchar fields to text type for better length handling:
 *   - authParams_state, authParams_redirect_uri, authorization_url in login_sessions
 *   - resource_servers, device in refresh_tokens
 *   - useragent in login_sessions
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // For SQLite, we need to handle circular foreign key dependencies between sessions and login_sessions
  // The approach is to backup data, drop both tables, then recreate them without circular dependencies

  // Step 1: Backup existing data
  await sql`CREATE TABLE sessions_backup AS SELECT * FROM sessions`.execute(db);
  await sql`CREATE TABLE login_sessions_backup AS SELECT * FROM login_sessions`.execute(
    db,
  );
  await sql`CREATE TABLE refresh_tokens_backup AS SELECT * FROM refresh_tokens`.execute(
    db,
  );

  // Step 2: Drop tables with foreign key dependencies (in correct order)
  await sql`DROP TABLE sessions`.execute(db);
  await sql`DROP TABLE login_sessions`.execute(db);
  await sql`DROP TABLE refresh_tokens`.execute(db);

  // Step 3: Create new refresh_tokens table with correct foreign key and composite primary key
  await db.schema
    .createTable("refresh_tokens")
    .addColumn("id", "varchar(21)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("client_id", "varchar(191)", (col) => col.notNull())
    .addColumn("session_id", "varchar(21)", (col) => col.notNull())
    .addColumn("user_id", "varchar(255)")
    .addColumn("resource_servers", "text", (col) => col.notNull())
    .addColumn("device", "text", (col) => col.notNull())
    .addColumn("rotating", "boolean", (col) => col.notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)")
    .addColumn("idle_expires_at", "varchar(35)")
    .addColumn("last_exchanged_at", "varchar(35)")
    .addPrimaryKeyConstraint("refresh_tokens_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint(
      "refresh_tokens_client_fk",
      ["tenant_id", "client_id"],
      "clients",
      ["tenant_id", "client_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  // Step 4: Create new sessions table with composite primary key
  await db.schema
    .createTable("sessions")
    .addColumn("id", "varchar(21)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(191)")
    .addColumn("user_id", "varchar(255)")
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)")
    .addColumn("idle_expires_at", "varchar(35)")
    .addColumn("authenticated_at", "varchar(35)")
    .addColumn("last_interaction_at", "varchar(35)")
    .addColumn("used_at", "varchar(35)")
    .addColumn("revoked_at", "varchar(35)")
    .addColumn("device", "text", (col) => col.notNull())
    .addColumn("clients", "text", (col) => col.notNull())
    .addColumn("login_session_id", "varchar(21)")
    .addPrimaryKeyConstraint("sessions_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint(
      "sessions_user_fk",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  // Step 5: Create new login_sessions table with composite primary key (no circular foreign key)
  await db.schema
    .createTable("login_sessions")
    .addColumn("id", "varchar(21)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("session_id", "varchar(21)")
    .addColumn("csrf_token", "varchar(21)", (col) => col.notNull())
    .addColumn("authParams_client_id", "varchar(191)", (col) => col.notNull())
    .addColumn("authParams_vendor_id", "varchar(255)")
    .addColumn("authParams_username", "varchar(255)")
    .addColumn("authParams_response_type", "varchar(255)")
    .addColumn("authParams_response_mode", "varchar(255)")
    .addColumn("authParams_audience", "varchar(255)")
    .addColumn("authParams_scope", "text")
    .addColumn("authParams_state", "text")
    .addColumn("authParams_nonce", "varchar(255)")
    .addColumn("authParams_code_challenge_method", "varchar(255)")
    .addColumn("authParams_code_challenge", "varchar(255)")
    .addColumn("authParams_redirect_uri", "text")
    .addColumn("authParams_organization", "varchar(255)")
    .addColumn("authParams_prompt", "varchar(32)")
    .addColumn("authParams_act_as", "varchar(256)")
    .addColumn("authParams_ui_locales", "varchar(32)")
    .addColumn("authorization_url", "text")
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)", (col) => col.notNull())
    .addColumn("ip", "varchar(39)")
    .addColumn("useragent", "text")
    .addColumn("auth0Client", "varchar(255)")
    .addColumn("login_completed", "integer", (col) => col.defaultTo(0))
    .addPrimaryKeyConstraint("login_sessions_pk", ["tenant_id", "id"])
    .addForeignKeyConstraint(
      "login_sessions_client_fk",
      ["tenant_id", "authParams_client_id"],
      "clients",
      ["tenant_id", "client_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addForeignKeyConstraint(
      "login_sessions_session_fk",
      ["tenant_id", "session_id"],
      "sessions",
      ["tenant_id", "id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  // Step 6: Restore data from backups
  await sql`INSERT INTO refresh_tokens 
    SELECT id, tenant_id, client_id, session_id, user_id, resource_servers, device, rotating, 
           created_at, expires_at, idle_expires_at, last_exchanged_at
    FROM refresh_tokens_backup`.execute(db);

  await sql`INSERT INTO sessions 
    SELECT id, tenant_id, user_id, created_at, updated_at, expires_at, idle_expires_at,
           authenticated_at, last_interaction_at, used_at, revoked_at, device, clients, login_session_id
    FROM sessions_backup`.execute(db);

  await sql`INSERT INTO login_sessions 
    SELECT id, tenant_id, session_id, csrf_token, authParams_client_id, authParams_vendor_id, authParams_username, 
           authParams_response_type, authParams_response_mode, authParams_audience, authParams_scope, authParams_state, 
           authParams_nonce, authParams_code_challenge_method, authParams_code_challenge, authParams_redirect_uri, 
           authParams_organization, authParams_prompt, authParams_act_as, authParams_ui_locales, authorization_url,
           created_at, updated_at, expires_at, ip, useragent, auth0Client, login_completed
    FROM login_sessions_backup`.execute(db);

  // Step 7: Clean up backup tables
  await sql`DROP TABLE sessions_backup`.execute(db);
  await sql`DROP TABLE login_sessions_backup`.execute(db);
  await sql`DROP TABLE refresh_tokens_backup`.execute(db);

  // Note: We removed the foreign key constraint from sessions.login_session_id to login_sessions
  // because login_sessions now has a composite primary key and the relationship is optional (SET NULL).
  // The application logic handles the relationship validation.
  // Note: tickets table was dropped in a previous migration (2024-12-05T13:05:00_drop_tickets).
}

/**
 * Down migration: Reverts foreign key constraints back to reference applications table.
 */
export async function down(db: Kysely<Database>): Promise<void> {
  // Remove foreign key constraint first
  await db.schema
    .alterTable("refresh_tokens")
    .dropConstraint("refresh_tokens_client_fk")
    .execute();

  // Revert refresh_tokens table
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("client_id")
    .execute();

  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("client_id", "varchar(21)", (col) =>
      col.references("applications.id").onDelete("cascade").notNull(),
    )
    .execute();

  // Remove the foreign key constraint from login_sessions
  await db.schema
    .alterTable("login_sessions")
    .dropConstraint("login_sessions_client_fk")
    .execute();
}
