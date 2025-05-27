import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("forms")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
    .addColumn("messages", "jsonb")
    .addColumn("languages", "jsonb")
    .addColumn("translations", "jsonb")
    .addColumn("nodes", "jsonb")
    .addColumn("start", "jsonb")
    .addColumn("ending", "jsonb")
    .addColumn("style", "jsonb")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .execute();

  // Create index for faster lookups by tenant
  await db.schema
    .createIndex("forms_tenant_id_idx")
    .on("forms")
    .column("tenant_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("forms").execute();
}
