import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("login_sessions")
    .addColumn("auth_connection", "varchar(255)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("auth_connection")
    .execute();
}
