import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Recreate the custom domains table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("custom_domains").execute();

  await db.schema
    .createTable("custom_domains")
    // This id will be provided by Cloudflare or other DNS provider
    .addColumn("custom_domain_id", "varchar(256)", (col) =>
      col.notNull().primaryKey(),
    )
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("domain", "varchar(255)", (col) => col.notNull())
    .addColumn("primary", "boolean", (col) => col.notNull())
    .addColumn("status", "varchar(50)", (col) => col.notNull())
    .addColumn("type", "varchar(50)", (col) => col.notNull())
    .addColumn("origin_domain_name", "varchar(255)")
    .addColumn("verification", "varchar(2048)")
    .addColumn("custom_client_ip_header", "varchar(50)")
    .addColumn("tls_policy", "varchar(50)")
    .addColumn("domain_metadata", "varchar(2048)")
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(_: Kysely<Database>): Promise<void> {}
