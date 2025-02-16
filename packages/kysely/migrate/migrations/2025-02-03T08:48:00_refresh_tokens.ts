import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: creates the `refresh_tokens` table.
 */
export async function up(db: Kysely<Database>): Promise<void> {
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
      "user_id_constraint",
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
 * Down migration: drops the `refresh_tokens` table.
 */
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("refresh_tokens").execute();
}
