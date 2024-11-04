import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("applications")
  //   .dropColumn("allowed_web_origins")
  //   .dropColumn("allowed_callback_urls")
  //   .execute();
  // await db.schema.dropTable("universal_login_sessions").execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("applications")
  //   .addColumn("allowed_web_origins", "varchar(1024)")
  //   .addColumn("allowed_callback_urls", "varchar(1024)")
  //   .execute();
  // await db.schema
  //   .createTable("universal_login_sessions")
  //   .addColumn("id", "varchar(255)", (col) => col.primaryKey())
  //   .addColumn("tenant_id", "varchar(255)", (col) =>
  //     col.references("tenants.id").onDelete("cascade").notNull(),
  //   )
  //   .addColumn("client_id", "varchar(255)", (col) => col.notNull())
  //   .addColumn("username", "varchar(255)")
  //   .addColumn("response_type", "varchar(255)")
  //   .addColumn("response_mode", "varchar(255)")
  //   .addColumn("audience", "varchar(255)")
  //   .addColumn("scope", "varchar(511)")
  //   .addColumn("state", "varchar(8192)")
  //   .addColumn("nonce", "varchar(255)")
  //   .addColumn("vendor_id", "varchar(255)")
  //   .addColumn("auth0Client", "varchar(255)")
  //   .addColumn("code_challenge_method", "varchar(256)")
  //   .addColumn("code_challenge", "varchar(256)")
  //   .addColumn("redirect_uri", "varchar(256)")
  //   .addColumn("created_at", "varchar(255)", (col) => col.notNull())
  //   .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
  //   .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
  //   .execute();
}