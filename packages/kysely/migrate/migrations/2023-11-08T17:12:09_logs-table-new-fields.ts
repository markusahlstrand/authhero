import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("logs")
  //   .dropColumn("client_id")
  //   .addColumn("tenant_id", "varchar(255)", (col) =>
  //     col.references("tenants.id").onDelete("cascade").notNull(),
  //   )
  //   .addColumn("user_id", "varchar(255)", (col) =>
  //     col.references("users.id").onDelete("cascade").notNull(),
  //   )
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("logs")
  //   .addColumn("client_id", "varchar(255)", (col) =>
  //     col.references("clients.id").onDelete("cascade").notNull(),
  //   )
  //   .dropColumn("tenant_id")
  //   .dropColumn("user_id")
  //   .execute();
}
