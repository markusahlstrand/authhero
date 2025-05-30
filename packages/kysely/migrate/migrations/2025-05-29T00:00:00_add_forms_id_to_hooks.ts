import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("hooks").addColumn("form_id", "text").execute();
  // 1. Add a new nullable column with the desired type
  await db.schema
    .alterTable("hooks")
    .addColumn("url_tmp", "varchar(512)")
    .execute();

  // 2. Copy existing values
  await db
    .updateTable("hooks")
    .set((eb) => ({ url_tmp: eb.ref("url") }))
    .execute();

  // 3. Drop the old column
  await db.schema.alterTable("hooks").dropColumn("url").execute();

  // 4. Rename the new column to 'url'
  await db.schema.alterTable("hooks").renameColumn("url_tmp", "url").execute();
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
