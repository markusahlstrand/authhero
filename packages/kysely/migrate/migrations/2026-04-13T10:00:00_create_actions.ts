import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("actions")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("code", "text", (col) => col.notNull())
    .addColumn("runtime", "varchar(50)")
    .addColumn("status", "varchar(50)", (col) => col.defaultTo("built"))
    .addColumn("secrets", "text")
    .addColumn("dependencies", "text")
    .addColumn("supported_triggers", "text")
    .addColumn("deployed_at_ts", "bigint")
    .addColumn("created_at_ts", "bigint", (col) => col.notNull())
    .addColumn("updated_at_ts", "bigint", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_actions_tenant")
    .on("actions")
    .columns(["tenant_id"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("actions").execute();
}
