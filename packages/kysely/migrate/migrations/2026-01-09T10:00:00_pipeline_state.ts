import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add pipeline_state field (JSON stored as text)
  // This replaces the login_completed column from migration n84
  await db.schema
    .alterTable("login_sessions")
    .addColumn("pipeline_state", "text")
    .execute();

  // Drop the old login_completed column (added in n84_login_completed)
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("login_completed")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Re-add login_completed column
  await db.schema
    .alterTable("login_sessions")
    .addColumn("login_completed", "boolean", (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();

  // Drop pipeline_state column
  await db.schema
    .alterTable("login_sessions")
    .dropColumn("pipeline_state")
    .execute();
}
