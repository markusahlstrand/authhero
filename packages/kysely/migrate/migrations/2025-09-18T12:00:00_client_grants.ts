import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // client_grants table
  await db.schema
    .createTable("client_grants")
    .addColumn("id", "varchar(21)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("client_id", "varchar(191)", (col) => col.notNull())
    .addColumn("audience", "varchar(191)", (col) => col.notNull())
    .addColumn("scope", "text", (col) => col.defaultTo("[]"))
    .addColumn("organization_usage", "varchar(32)")
    .addColumn("allow_any_organization", "integer", (col) => col.defaultTo(0))
    .addColumn("is_system", "integer", (col) => col.defaultTo(0))
    .addColumn("subject_type", "varchar(32)")
    .addColumn("authorization_details_types", "text", (col) =>
      col.defaultTo("[]"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_client_grants", ["tenant_id", "id"])
    .addForeignKeyConstraint(
      "fk_client_grants_clients",
      ["tenant_id", "client_id"],
      "clients",
      ["tenant_id", "client_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  // Unique index on tenant_id + client_id + audience
  await db.schema
    .createIndex("uq_client_grants_tenant_client_audience")
    .on("client_grants")
    .columns(["tenant_id", "client_id", "audience"])
    .unique()
    .execute();

  // Index for audience lookups
  await db.schema
    .createIndex("idx_client_grants_audience")
    .on("client_grants")
    .columns(["audience"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("client_grants").execute();
}
