import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add auth0_conformant column to clients table
  // Defaults to 1 (true) for Auth0-compatible behavior
  await db.schema
    .alterTable("clients")
    .addColumn("auth0_conformant", "integer", (col) => col.defaultTo(1))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("clients").dropColumn("auth0_conformant").execute();
}
