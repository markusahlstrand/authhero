import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sessions")
    .addColumn("login_session_id", "varchar(21)", (col) =>
      col.references("login_sessions.id").onDelete("set null"),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sessions")
    .dropColumn("login_session_id")
    .execute();
}
