import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("forms")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("type", "varchar(255)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
    .addColumn("client_id", "varchar(255)")
    .addColumn("fields", "text", (col) => col.notNull())
    .addColumn("controls", "text")
    .addColumn("redirect_uri", "varchar(2048)")
    .addColumn("post_submit_action", "varchar(255)")
    .addColumn("success_message", "text")
    .addColumn("language", "varchar(10)")
    .addColumn("active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("layout", "text")
    .addColumn("css", "text")
    .addColumn("javascript", "text")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .execute();

  // Create indexes for faster lookups
  await db.schema
    .createIndex("forms_tenant_id_idx")
    .on("forms")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("forms_client_id_idx")
    .on("forms")
    .column("client_id")
    .execute();

  await db.schema
    .createIndex("forms_type_idx")
    .on("forms")
    .column("type")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("forms").execute();
}
