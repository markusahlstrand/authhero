import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("hooks").addColumn("form_id", "text").execute();
  await db.schema
    .alterTable("hooks")
    .alterColumn("url", (ac) => ac.setDataType("varchar(512)"))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("hooks").ifExists().execute();

  await db.schema
    .createTable("hooks")
    .addColumn("hook_id", "text", (col) => col.primaryKey())
    .addColumn("tenant_id", "text", (col) => col.notNull())
    .addColumn("trigger_id", "text", (col) => col.notNull())
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("url", "varchar(512)", (col) => col.notNull())
    .addColumn("synchronous", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("priority", "integer")
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .execute();
}
