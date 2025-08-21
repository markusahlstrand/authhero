import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("keys")
    .addColumn("kid", "varchar(255)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade"),
    )

    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("revoked_at", "varchar(255)")
    .addColumn("cert", "varchar(4096)")
    .addColumn("pkcs7", "varchar(4096)")
    .addColumn("fingerprint", "varchar(256)")
    .addColumn("thumbprint", "varchar(256)")
    .addColumn("current_since", "varchar(256)")
    .addColumn("current_until", "varchar(256)")
    .addColumn("type", "varchar(50)", (col) =>
      col.notNull().defaultTo("jwt_signing"),
    )
    .addColumn("connection", "varchar(255)", (col) =>
      col.references("connections.id").onDelete("cascade"),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("keys").execute();
}
