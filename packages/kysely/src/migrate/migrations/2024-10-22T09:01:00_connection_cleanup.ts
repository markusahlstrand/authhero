import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("connections")
  //   .dropColumn("scope")
  //   .dropColumn("private_key")
  //   .dropColumn("kid")
  //   .dropColumn("team_id")
  //   .dropColumn("options_kid")
  //   .dropColumn("options_team_id")
  //   .dropColumn("options_client_id")
  //   .dropColumn("options_client_secret")
  //   .dropColumn("options_scope")
  //   .dropColumn("options_realms")
  //   .dropColumn("options_app_secret")
  //   .dropColumn("client_id")
  //   .dropColumn("client_secret")
  //   .dropColumn("authorization_endpoint")
  //   .dropColumn("token_endpoint")
  //   .dropColumn("userinfo_endpoint")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("connections")
  //   .addColumn("scope", "varchar(255)")
  //   .addColumn("private_key", "varchar(255)")
  //   .addColumn("kid", "varchar(255)")
  //   .addColumn("team_id", "varchar(255)")
  //   .addColumn("client_id", "varchar(255)")
  //   .addColumn("client_secret", "varchar(255)")
  //   .addColumn("options_kid", "varchar(32)")
  //   .addColumn("options_team_id", "varchar(32)")
  //   .addColumn("options_client_id", "varchar(32)")
  //   .addColumn("options_client_secret", "varchar(255)")
  //   .addColumn("options_scope", "varchar(255)")
  //   .addColumn("options_realms", "varchar(255)")
  //   .addColumn("options_app_secret", "varchar(1024)")
  //   .addColumn("authorization_endpoint", "varchar(255)")
  //   .addColumn("token_endpoint", "varchar(255)")
  //   .addColumn("userinfo_endpoint", "varchar(255)")
  //   .execute();
}
