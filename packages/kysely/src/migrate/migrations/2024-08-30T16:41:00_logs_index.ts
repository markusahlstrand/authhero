import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(db: Kysely<Database>): Promise<void> {
  // Backported this to the table creation
  // await db.schema
  //   .alterTable("logs")
  //   .modifyColumn("date", "varchar(25)", (col) => col.notNull())
  //   .modifyColumn("type", "varchar(8)", (col) => col.notNull())
  //   .modifyColumn("tenant_id", "varchar(64)", (col) => col.notNull())
  //   .modifyColumn("user_id", "varchar(64)", (col) => col.notNull())
  //   .execute();

  await db.schema
    .createIndex("IDX_logs_tenant_date_type_user")
    .on("logs")
    .columns(["tenant_id", "date", "type", "user_id"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("logs")
  //   .modifyColumn("date", "varchar(255)", (col) => col.notNull())
  //   .modifyColumn("type", "varchar(255)", (col) => col.notNull())
  //   .modifyColumn("tenant_id", "varchar(255)", (col) => col.notNull())
  //   .modifyColumn("user_id", "varchar(255)", (col) => col.notNull())
  //   .execute();

  await db.schema
    .dropIndex("IDX_logs_tenant_date_type_user")
    .on("logs")
    .execute();
}
