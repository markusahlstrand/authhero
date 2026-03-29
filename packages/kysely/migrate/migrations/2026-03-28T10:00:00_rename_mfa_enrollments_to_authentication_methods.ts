import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("mfa_enrollments")
    .renameTo("authentication_methods")
    .execute();

  await db.schema
    .alterTable("authentication_methods")
    .addColumn("credential_id", "varchar(512)")
    .execute();

  await db.schema
    .alterTable("authentication_methods")
    .addColumn("public_key", "text")
    .execute();

  await db.schema
    .alterTable("authentication_methods")
    .addColumn("sign_count", "integer")
    .execute();

  await db.schema
    .alterTable("authentication_methods")
    .addColumn("credential_backed_up", "integer")
    .execute();

  await db.schema
    .alterTable("authentication_methods")
    .addColumn("transports", "varchar(512)")
    .execute();

  await db.schema
    .alterTable("authentication_methods")
    .addColumn("friendly_name", "varchar(255)")
    .execute();

  await db.schema
    .createIndex("authentication_methods_credential_id_idx")
    .on("authentication_methods")
    .column("credential_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .dropIndex("authentication_methods_credential_id_idx")
    .execute();

  await db.schema
    .alterTable("authentication_methods")
    .dropColumn("friendly_name")
    .execute();
  await db.schema
    .alterTable("authentication_methods")
    .dropColumn("transports")
    .execute();
  await db.schema
    .alterTable("authentication_methods")
    .dropColumn("credential_backed_up")
    .execute();
  await db.schema
    .alterTable("authentication_methods")
    .dropColumn("sign_count")
    .execute();
  await db.schema
    .alterTable("authentication_methods")
    .dropColumn("public_key")
    .execute();
  await db.schema
    .alterTable("authentication_methods")
    .dropColumn("credential_id")
    .execute();

  await db.schema
    .alterTable("authentication_methods")
    .renameTo("mfa_enrollments")
    .execute();
}
