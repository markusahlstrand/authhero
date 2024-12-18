import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("keys")
  //   .addColumn("cert", "varchar(2048)")
  //   .addColumn("pkcs7", "varchar(2048)")
  //   .addColumn("fingerprint", "varchar(256)")
  //   .addColumn("thumbprint", "varchar(256)")
  //   .addColumn("current_since", "varchar(256)")
  //   .addColumn("current_until", "varchar(256)")
  //   .modifyColumn("private_key", "varchar(8192)")
  //   .modifyColumn("public_key", "varchar(1024)")
  //   .execute();
}

export async function down(_: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("keys")
  //   .dropColumn("cert")
  //   .dropColumn("pkcs7")
  //   .dropColumn("fingerprint")
  //   .dropColumn("thumbprint")
  //   .dropColumn("current_since")
  //   .dropColumn("current_until")
  //   .modifyColumn("private_key", "varchar(8192)", (col) => col.notNull())
  //   .modifyColumn("public_key", "varchar(1024)", (col) => col.notNull())
  //   .execute();
}
