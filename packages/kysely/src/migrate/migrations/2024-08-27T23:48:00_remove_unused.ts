import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(db: Kysely<Database>): Promise<void> {
  // await db.schema
  //   .alterTable("keys")
  //   .dropColumn("private_key")
  //   .dropColumn("public_key")
  //   .execute();

  await db.schema.dropTable("otps").execute();
  await db.schema.dropTable("authentication_codes").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("keys")
    .addColumn("private_key", "varchar(2048)")
    .addColumn("public_key", "varchar(2048)")
    .execute();

  await db.schema
    .createTable("otps")
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("client_id", "varchar(255)", (col) =>
      col.references("applications.id").onDelete("cascade").notNull(),
    )
    .addColumn("code", "varchar(255)", (col) => col.notNull())
    .addColumn("email", "varchar(255)", (col) => col.notNull())
    .addColumn("user_id", "varchar(255)")
    .addColumn("send", "varchar(255)")
    .addColumn("nonce", "varchar(255)")
    .addColumn("state", "varchar(1024)")
    .addColumn("scope", "varchar(1024)")
    .addColumn("response_type", "varchar(256)")
    .addColumn("response_mode", "varchar(256)")
    .addColumn("redirect_uri", "varchar(1024)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
    .addColumn("used_at", "varchar(255)")
    .execute();

  await db.schema
    .createTable("authentication_codes")
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("code", "varchar(255)", (col) => col.primaryKey())
    .addColumn("client_id", "varchar(255)", (col) =>
      col.references("applications.id").onDelete("cascade").notNull(),
    )
    .addColumn("user_id", "varchar(255)", (col) => col.notNull())
    .addColumn("nonce", "varchar(255)")
    .addColumn("state", "varchar(8192)")
    .addColumn("scope", "varchar(1024)")
    .addColumn("response_type", "varchar(256)")
    .addColumn("response_mode", "varchar(256)")
    .addColumn("redirect_uri", "varchar(1024)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
    .addColumn("used_at", "varchar(255)")
    .execute();
}
