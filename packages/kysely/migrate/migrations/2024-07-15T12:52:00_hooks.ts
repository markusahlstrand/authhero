import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("hooks")
    .addColumn("hook_id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("url", "varchar(512)", (col) => col.notNull())
    .addColumn("trigger_id", "varchar(255)", (col) => col.notNull())
    .addColumn("enabled", "boolean", (col) => col.notNull())
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .addColumn("synchronous", "boolean", (col) =>
      col.defaultTo(false).notNull(),
    )
    .addColumn("priority", "integer")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("hooks").execute();
}
