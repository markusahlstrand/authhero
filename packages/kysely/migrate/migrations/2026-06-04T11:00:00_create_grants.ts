import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("grants")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("user_id", "varchar(255)", (col) => col.notNull())
    .addForeignKeyConstraint(
      "grants_user_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("client_id", "varchar(255)", (col) => col.notNull())
    .addColumn("audience", "varchar(255)", (col) => col.notNull().defaultTo(""))
    .addColumn("scope", "varchar(4096)", (col) =>
      col.notNull().defaultTo("[]"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("grants_natural_key_idx")
    .on("grants")
    .columns(["tenant_id", "user_id", "client_id", "audience"])
    .unique()
    .execute();

  await db.schema
    .createIndex("grants_tenant_user_idx")
    .on("grants")
    .columns(["tenant_id", "user_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("grants").execute();
}
