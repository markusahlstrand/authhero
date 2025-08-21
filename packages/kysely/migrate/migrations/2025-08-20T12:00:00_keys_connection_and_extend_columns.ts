import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(_: Kysely<Database>): Promise<void> {
  // export async function up(db: Kysely<Database>): Promise<void> {
  // Add connection column to keys table with foreign key constraint
  //   await db.schema
  //     .alterTable("keys")
  //     .addColumn("connection", "varchar(255)", (col) =>
  //       col.references("connections.id").onDelete("cascade"),
  //     )
  //     .execute();
  //   // Extend cert column from varchar(2048) to varchar(4096)
  //   await db.schema
  //     .alterTable("keys")
  //     .alterColumn("cert", (col) => col.setDataType("varchar(4096)"))
  //     .execute();
  //   // Extend pkcs7 column from varchar(2048) to varchar(4096)
  //   await db.schema
  //     .alterTable("keys")
  //     .alterColumn("pkcs7", (col) => col.setDataType("varchar(4096)"))
  //     .execute();
  // Add type column to keys table with default value for existing records
  //   await db.schema
  //     .alterTable("keys")
  //     .addColumn("type", "varchar(50)", (col) =>
  //       col.notNull().defaultTo("jwt_signing"),
  //     )
  // .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Remove connection column (this will also drop the foreign key constraint)
  await db.schema.alterTable("keys").dropColumn("connection").execute();

  // Revert cert column back to varchar(2048)
  await db.schema
    .alterTable("keys")
    .alterColumn("cert", (col) => col.setDataType("varchar(2048)"))
    .execute();

  // Revert pkcs7 column back to varchar(2048)
  await db.schema
    .alterTable("keys")
    .alterColumn("pkcs7", (col) => col.setDataType("varchar(2048)"))
    .execute();

  // Remove type column
  await db.schema.alterTable("keys").dropColumn("type").execute();
}
