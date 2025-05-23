import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("keys")
    .addColumn("kid", "varchar(255)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade"),
    )
    // This will be removed in a future migration
    // .addColumn("private_key", "varchar(8192)", (col) => col.notNull())
    // .addColumn("public_key", "varchar(1024)", (col) => col.notNull())
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("revoked_at", "varchar(255)")
    .addColumn("cert", "varchar(2048)")
    .addColumn("pkcs7", "varchar(2048)")
    .addColumn("fingerprint", "varchar(256)")
    .addColumn("thumbprint", "varchar(256)")
    .addColumn("current_since", "varchar(256)")
    .addColumn("current_until", "varchar(256)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("keys").execute();
}
