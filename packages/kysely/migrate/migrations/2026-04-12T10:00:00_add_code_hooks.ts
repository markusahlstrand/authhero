import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("hook_code")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("code", "text", (col) => col.notNull())
    .addColumn("secrets", "text")
    .addColumn("created_at_ts", "bigint", (col) => col.notNull())
    .addColumn("updated_at_ts", "bigint", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_hook_code_tenant")
    .on("hook_code")
    .columns(["tenant_id"])
    .execute();

  await db.schema
    .alterTable("hooks")
    .addColumn("code_id", "varchar(21)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("hooks").dropColumn("code_id").execute();
  await db.schema.dropTable("hook_code").execute();
}
