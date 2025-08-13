import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Resource Servers table
  await db.schema
    .createTable("resource_servers")
    .addColumn("id", "varchar(21)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("identifier", "varchar(191)", (col) => col.notNull())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("scopes", "varchar(4096)") // JSON array string
    .addColumn("signing_alg", "varchar(64)")
    .addColumn("signing_secret", "varchar(2048)")
    .addColumn("token_lifetime", "integer")
    .addColumn("token_lifetime_for_web", "integer")
    .addColumn("skip_consent_for_verifiable_first_party_clients", "integer")
    .addColumn("allow_offline_access", "integer")
    .addColumn("verification_key", "varchar(4096)")
    .addColumn("options", "varchar(4096)") // JSON object string
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .addPrimaryKeyConstraint("resource_servers_pk", ["tenant_id", "id"])
    .execute();

  await db.schema
    .createIndex("resource_servers_tenant_identifier_uq")
    .on("resource_servers")
    .columns(["tenant_id", "identifier"])
    .unique()
    .execute();

  // Roles table
  await db.schema
    .createTable("roles")
    .addColumn("id", "varchar(21)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("name", "varchar(50)", (col) => col.notNull())
    .addColumn("description", "varchar(255)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .addPrimaryKeyConstraint("roles_pk", ["tenant_id", "id"])
    .execute();

  // Add unique constraint on tenant_id + name since role names should be unique per tenant
  await db.schema
    .createIndex("roles_tenant_name_uq")
    .on("roles")
    .columns(["tenant_id", "name"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("roles").execute();
  await db.schema.dropTable("resource_servers").execute();
}
