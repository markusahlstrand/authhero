import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("universal_login_templates")
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.primaryKey().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("updated_at_ts", "integer", (col) => col.notNull())
    .addColumn("created_at_ts", "integer", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("universal_login_templates").execute();
}
