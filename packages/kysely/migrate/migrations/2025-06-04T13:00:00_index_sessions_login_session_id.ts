import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createIndex("IDX_sessions_login_session_id")
    .on("sessions")
    .column("login_session_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .dropIndex("IDX_sessions_login_session_id")
    .on("sessions")
    .execute();
}
