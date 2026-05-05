import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("clients")
    .addColumn("owner_user_id", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("clients")
    .addColumn("registration_type", "varchar(32)")
    .execute();

  await db.schema
    .alterTable("clients")
    .addColumn("registration_metadata", "text")
    .execute();

  await db.schema
    .createIndex("idx_clients_owner_user_id")
    .on("clients")
    .columns(["tenant_id", "owner_user_id"])
    .execute();

  await db.schema
    .createTable("client_registration_tokens")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("token_hash", "varchar(64)", (col) => col.notNull())
    .addColumn("type", "varchar(8)", (col) => col.notNull())
    .addColumn("client_id", "varchar(191)")
    .addColumn("sub", "varchar(255)")
    .addColumn("constraints", "text")
    .addColumn("single_use", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("used_at_ts", "bigint")
    .addColumn("expires_at_ts", "bigint")
    .addColumn("created_at_ts", "bigint", (col) => col.notNull())
    .addColumn("revoked_at_ts", "bigint")
    .execute();

  await db.schema
    .createIndex("idx_client_registration_tokens_hash")
    .on("client_registration_tokens")
    .columns(["tenant_id", "token_hash"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_client_registration_tokens_client")
    .on("client_registration_tokens")
    .columns(["tenant_id", "client_id"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("client_registration_tokens").execute();

  await db.schema.dropIndex("idx_clients_owner_user_id").execute();

  await db.schema
    .alterTable("clients")
    .dropColumn("registration_metadata")
    .execute();

  await db.schema
    .alterTable("clients")
    .dropColumn("registration_type")
    .execute();

  await db.schema.alterTable("clients").dropColumn("owner_user_id").execute();
}
