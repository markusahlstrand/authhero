// @ts-nocheck - Migration modifies columns not in the Database type
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
import { migrationLog } from "../log";

/**
 * Fixes a regression introduced by 2025-09-11T12:00:00_add_organization_to_user_permissions_and_roles
 * which recreated the `user_permissions` table with
 * `resource_server_identifier varchar(21)`. The original definition was
 * `varchar(191)` and many resource server identifiers (e.g. URLs or URNs like
 * `urn:authhero:management`) exceed 21 characters, causing MySQL/PlanetScale
 * inserts to fail with "Data too long for column".
 */

async function getDatabaseType(
  db: Kysely<Database>,
): Promise<"mysql" | "sqlite"> {
  try {
    await sql`SELECT VERSION()`.execute(db);
    return "mysql";
  } catch {
    return "sqlite";
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  if (dbType !== "mysql") {
    // SQLite ignores varchar length, nothing to fix.
    return;
  }

  migrationLog(
    "Widening user_permissions.resource_server_identifier from varchar(21) to varchar(191)...",
  );

  await db.schema
    .alterTable("user_permissions")
    .modifyColumn("resource_server_identifier", "varchar(191)", (col) =>
      col.notNull(),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  if (dbType !== "mysql") {
    return;
  }

  await db.schema
    .alterTable("user_permissions")
    .modifyColumn("resource_server_identifier", "varchar(21)", (col) =>
      col.notNull(),
    )
    .execute();
}
