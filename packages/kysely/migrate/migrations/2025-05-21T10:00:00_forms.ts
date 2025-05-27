import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("forms")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
    .addColumn("messages", "varchar(255)")
    .addColumn("languages", "varchar(255)")
    .addColumn("translations", "varchar(4096)")
    .addColumn("nodes", "varchar(4096)")
    .addColumn("start", "varchar(255)")
    .addColumn("ending", "varchar(255)")
    .addColumn("style", "varchar(1042)")
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
