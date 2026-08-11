import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Page hooks: `page_id` names a built-in universal-login interstitial (e.g.
 * `impersonate`) and `permission_required` optionally gates it on a user
 * permission. Both nullable — only page-type hook rows use them.
 */

// Tolerates "duplicate column" (MySQL errno 1060) so the migration is safe to
// re-run against a database that already has the column.
async function safeAddColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
  columnType: ReturnType<typeof sql>,
): Promise<void> {
  try {
    await db.schema
      .alterTable(tableName)
      .addColumn(columnName, columnType)
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
  await safeAddColumn(db, "hooks", "page_id", sql`varchar(64)`);
  await safeAddColumn(db, "hooks", "permission_required", sql`varchar(255)`);
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
  await safeDropColumn(db, "hooks", "permission_required");
  await safeDropColumn(db, "hooks", "page_id");
}
