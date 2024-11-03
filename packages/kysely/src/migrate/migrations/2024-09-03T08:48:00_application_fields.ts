import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("applications")
  //   .addColumn("allowed_clients", "varchar(1024)", (col) =>
  //     col.defaultTo("[]").notNull(),
  //   )
  //   .dropColumn("styling_settings")
  //   .execute();
  //   await db.schema
  //     .alterTable("connections")
  //     .addColumn("options_kid", "varchar(32)")
  //     .addColumn("options_team_id", "varchar(32)")
  //     .addColumn("options_client_id", "varchar(32)")
  //     .addColumn("options_client_secret", "varchar(255)")
  //     .addColumn("options_scope", "varchar(255)")
  //     .addColumn("options_realms", "varchar(255)")
  //     .addColumn("options_app_secret", "varchar(1024)")
  //     .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("applications")
  //   .dropColumn("allowed_clients")
  //   .execute();
  // await db.schema
  //   .alterTable("connections")
  //   .dropColumn("options_kid")
  //   .dropColumn("options_team_id")
  //   .dropColumn("options_client_id")
  //   .dropColumn("options_client_secret")
  //   .dropColumn("options_scope")
  //   .dropColumn("options_realms")
  //   .dropColumn("options_app_secret")
  //   .addColumn("styling_settings", "varchar(255)")
  //   .execute();
}
