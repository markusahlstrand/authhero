import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Drop the applications table
  await db.schema.dropTable("applications").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Recreate the applications table (based on the original schema)
  await db.schema
    .createTable("applications")
    .addColumn("id", "varchar(21)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("client_secret", "varchar(255)")
    .addColumn("callbacks", "text", (col) => col.defaultTo("[]"))
    .addColumn("allowed_origins", "text", (col) => col.defaultTo("[]"))
    .addColumn("web_origins", "text", (col) => col.defaultTo("[]"))
    .addColumn("allowed_logout_urls", "text", (col) => col.defaultTo("[]"))
    .addColumn("allowed_clients", "text", (col) => col.defaultTo("[]"))
    .addColumn("disable_sign_ups", "integer", (col) => col.defaultTo(0))
    .addColumn("addons", "text", (col) => col.defaultTo("{}"))
    .addColumn("client_metadata", "text", (col) => col.defaultTo("{}"))
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_applications", ["tenant_id", "id"])
    .execute();

  // Recreate indexes
  await db.schema
    .createIndex("idx_applications_tenant_id")
    .on("applications")
    .columns(["tenant_id"])
    .execute();
}
