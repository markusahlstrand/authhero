import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // Uncomment this for planetscale migration
  //   await db.schema
  //     .alterTable("universal_login_sessions")
  //     // column this long working on planetscale on logs column
  //     .modifyColumn("state", "varchar(8192)")
  //     .execute();
  // In SQLite we have to drop and recreate the column
  // await db.schema
  //   .alterTable("universal_login_sessions")
  //   .dropColumn("state")
  //   .execute();
  // await db.schema
  //   .alterTable("universal_login_sessions")
  //   .addColumn("state", "varchar(8192)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("universal_login_sessions")
  //   .dropColumn("state")
  //   .execute();
  // await db.schema
  //   .alterTable("universal_login_sessions")
  //   .addColumn("state", "varchar(1024)")
  //   .execute();
}
