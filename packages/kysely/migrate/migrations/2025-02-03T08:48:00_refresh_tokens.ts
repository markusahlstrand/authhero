import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: creates the `refresh_tokens` table.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("refresh_tokens")
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("token", "varchar(255)", (col) => col.notNull())
    .addColumn("session_id", "varchar(255)", (col) =>
      col.references("sessions.session_id").onDelete("cascade").notNull(),
    )
    .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
    .addColumn("used_at", "varchar(255)")
    .addColumn("scope", "varchar(512)", (col) => col.notNull())
    .addColumn("audience", "varchar(512)", (col) => col.notNull())
    .addColumn("revoked_at", "varchar(255)")
    .addColumn("created_at", "varchar(255)", (col) =>
      col.notNull().defaultTo(new Date().toISOString()),
    )
    .addPrimaryKeyConstraint("refresh_tokens_pkey", ["tenant_id", "token"])
    .execute();
}

/**
 * Down migration: drops the `refresh_tokens` table.
 */
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("refresh_tokens").execute();
}
