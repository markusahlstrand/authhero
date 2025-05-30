import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("login_sessions")
    .addColumn("login_completed", "boolean", (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("login_completed")
    .execute();
}
