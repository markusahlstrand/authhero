import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("mfa_enrollments")
    .addColumn("id", "varchar(26)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("user_id", "varchar(255)", (col) => col.notNull())
    .addColumn("type", "varchar(32)", (col) => col.notNull())
    .addColumn("phone_number", "varchar(32)")
    .addColumn("totp_secret", "varchar(255)")
    .addColumn("confirmed", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at_ts", "bigint", (col) => col.notNull())
    .addColumn("updated_at_ts", "bigint", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("mfa_enrollments_tenant_user_idx")
    .on("mfa_enrollments")
    .columns(["tenant_id", "user_id"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("mfa_enrollments").execute();
}
