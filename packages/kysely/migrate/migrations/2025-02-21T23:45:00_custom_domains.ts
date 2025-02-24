import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Add a new custom domains table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("custom_domains")
    .addColumn("custom_domain_id", "varchar(21)", (col) =>
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
    .addColumn("created_at", "timestamp", (col) => col.notNull())
    .addColumn("updated_at", "timestamp", (col) => col.notNull())
    .execute();

  await db.schema.dropTable("domains").execute();
}

/**
 * Down migration: restore the domains table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("custom_domains").execute();

  await db.schema
    .createTable("domains")
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("domain", "varchar(255)", (col) => col.notNull())
    .addColumn("email_service", "varchar(255)")
    .addColumn("email_api_key", "varchar(255)")
    .addColumn("dkim_private_key", "varchar(2048)")
    .addColumn("dkim_public_key", "varchar(2048)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .execute();
}
