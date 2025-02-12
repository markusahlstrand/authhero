import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: changes the primary key to id.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Add this temporarily before replacing the table
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("rotating", "boolean")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("device", "varchar(1024)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("resource_servers", "varchar(1024)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("user_id", "varchar(255)")
    .execute();
  await db.schema.alterTable("refresh_tokens").dropColumn("scope").execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("scope", "varchar(255)")
    .execute();
  await db.schema.alterTable("refresh_tokens").dropColumn("audience").execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("audience", "varchar(255)")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .dropColumn("session_id")
    .execute();
  await db.schema
    .alterTable("refresh_tokens")
    .addColumn("session_id", "varchar(255)")
    .execute();

  await db.schema
    .createTable("sessions_new")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)")
    .addColumn("user_id", "varchar(255)")
    // same change here as on other tables - FK reference needed to users table
    .addForeignKeyConstraint(
      "user_id_constraint",
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
    .createTable("refresh_tokens_new")
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
      "user_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
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
 * Down migration: drops the added sessions table fields
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("sessions_new").execute();
  await db.schema.dropTable("refresh_tokens_new").execute();
}
