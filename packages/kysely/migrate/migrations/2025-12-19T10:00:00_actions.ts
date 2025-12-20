import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("flows")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("actions", "text")
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .execute();

  // Create index for faster lookups by tenant
  await db.schema
    .createIndex("flows_tenant_id_idx")
    .on("flows")
    .column("tenant_id")
    .execute();

  // Remove old backup table
  await db.schema.dropTable("passwords_backup").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("flows").execute();
}
