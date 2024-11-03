import { Kysely } from "kysely";
import { Database } from "@authhero/kysely-adapter";

export async function up(db: Kysely<Database>): Promise<void> {
  // universal_login_experience: z.enum(["new", "classic"]).default("new"),
  // identifier_first: z.boolean().default(true),
  // password_first: z.boolean().default(false),
  // webauthn_platform_first_factor: z.boolean(),

  await db.schema
    .createTable("prompt_settings")
    .addColumn("tenant_id", "varchar(64)", (col) => col.primaryKey())
    .addColumn("universal_login_experience", "varchar(16)", (col) =>
      col.defaultTo("new").notNull(),
    )
    .addColumn("identifier_first", "boolean", (col) =>
      col.defaultTo(true).notNull(),
    )
    .addColumn("password_first", "boolean", (col) =>
      col.defaultTo(false).notNull(),
    )
    .addColumn("webauthn_platform_first_factor", "boolean", (col) =>
      col.defaultTo(false).notNull(),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("prompt_settings").execute();
}
