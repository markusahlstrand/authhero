import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Resource Servers table
  await db.schema
    .createTable("resource_servers")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("identifier", "varchar(191)", (col) => col.notNull())
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
    .execute();

  await db.schema
    .createIndex("resource_servers_tenant_identifier_uq")
    .on("resource_servers")
    .columns(["tenant_id", "identifier"])
    .unique()
    .execute();

  // Permissions table
  await db.schema
    .createTable("permissions")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("permission_name", "varchar(255)", (col) => col.notNull())
    .addColumn("description", "varchar(1024)")
    .addColumn("resource_server_identifier", "varchar(191)", (col) =>
      col.notNull(),
    )
    .addColumn("resource_server_name", "varchar(255)", (col) => col.notNull())
    .addColumn("sources", "varchar(4096)") // JSON array string
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("permissions_tenant_identifier_name_uq")
    .on("permissions")
    .columns(["tenant_id", "resource_server_identifier", "permission_name"])
    .unique()
    .execute();

  // Roles table
  await db.schema
    .createTable("roles")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("name", "varchar(50)", (col) => col.notNull())
    .addColumn("description", "varchar(255)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("roles_tenant_name_uq")
    .on("roles")
    .columns(["tenant_id", "name"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("roles").execute();
  await db.schema.dropTable("permissions").execute();
  await db.schema.dropTable("resource_servers").execute();
}
