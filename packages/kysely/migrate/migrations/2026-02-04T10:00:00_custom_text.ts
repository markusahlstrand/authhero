import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("custom_text")
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.notNull().references("tenants.id").onDelete("cascade"),
    )
    .addColumn("prompt", "varchar(64)", (col) => col.notNull())
    .addColumn("language", "varchar(16)", (col) => col.notNull())
    .addColumn("custom_text", "text", (col) => col.notNull())
    .addColumn("created_at_ts", "bigint", (col) => col.notNull())
    .addColumn("updated_at_ts", "bigint", (col) => col.notNull())
    .addPrimaryKeyConstraint("custom_text_pk", [
      "tenant_id",
      "prompt",
      "language",
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("custom_text").execute();
}
