import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Add `show_last_used_connection` to prompt_settings (issue #1138): opt-in
 * flag for the "Last used" connection hint on the universal-login identifier
 * screen. Nullable, so existing rows migrate cleanly with a NULL that reads
 * back as "off". Stored as tinyint(1) to match the other boolean columns.
 */

// Tolerates "duplicate column" (MySQL errno 1060) so the migration is safe to
// re-run against a database that already has the column.
async function safeAddColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema
      .alterTable(tableName)
      .addColumn(columnName, sql`tinyint(1)`)
      .execute();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("1060") ||
        error.message.toLowerCase().includes("duplicate column"))
    ) {
      return;
    }
    throw error;
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  await safeAddColumn(db, "prompt_settings", "show_last_used_connection");
}

// PlanetScale doesn't support IF EXISTS here, so tolerate "doesn't exist".
async function safeDropColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema.alterTable(tableName).dropColumn(columnName).execute();
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("1091")) return;
    throw error;
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await safeDropColumn(db, "prompt_settings", "show_last_used_connection");
}
