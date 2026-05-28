import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("proxy_routes")
    .addColumn("id", "varchar(64)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
    .addColumn("custom_domain_id", "varchar(256)", (col) => col.notNull())
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("path_pattern", "varchar(512)", (col) => col.notNull())
    .addColumn("upstream_type", "varchar(32)", (col) => col.notNull())
    .addColumn("upstream_url", "varchar(2048)", (col) => col.notNull())
    .addColumn("preserve_host", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("middleware", "varchar(8192)", (col) =>
      col.notNull().defaultTo("[]"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("proxy_routes_tenant_id_idx")
    .on("proxy_routes")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("proxy_routes_custom_domain_id_idx")
    .on("proxy_routes")
    .column("custom_domain_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("proxy_routes").execute();
}
