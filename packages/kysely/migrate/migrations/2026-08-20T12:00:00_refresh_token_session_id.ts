import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Reparent refresh tokens onto sessions (stage 2).
 *
 * `session_id` is Auth0's field of the same name: the authenticated session a
 * token was issued under. Deliberately NOT a foreign key — a refresh token is
 * expected to outlive its session, so cleanup removes the session row first
 * and this pointer is left to dangle rather than cascading. It carries
 * revocation semantics only.
 *
 * The remaining columns are auth-event facts denormalised from the login
 * session at mint time, so the refresh grant stops resolving them through a
 * short-lived row that may already have been cleaned up.
 *
 * All nullable: rows minted before this migration have none of them, which is
 * the same state Auth0 represents with a null `session_id`.
 */

const COLUMNS: Array<[string, ReturnType<typeof sql>]> = [
  ["session_id", sql`varchar(26)`],
  ["organization", sql`varchar(191)`],
  ["auth_connection", sql`varchar(255)`],
  ["auth_strategy_strategy", sql`varchar(64)`],
  ["auth_strategy_strategy_type", sql`varchar(64)`],
];

// Tolerates "duplicate column" (MySQL errno 1060) so the migration is safe to
// re-run against a database that already has the column.
async function safeAddColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
  type: ReturnType<typeof sql>,
): Promise<void> {
  try {
    await db.schema.alterTable(tableName).addColumn(columnName, type).execute();
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

// Tolerates "duplicate key name" (MySQL errno 1061).
async function safeCreateIndex(db: Kysely<Database>): Promise<void> {
  try {
    await db.schema
      .createIndex("idx_refresh_tokens_session_id")
      .on("refresh_tokens")
      .columns(["tenant_id", "session_id"])
      .execute();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("1061") ||
        error.message.toLowerCase().includes("duplicate key name"))
    ) {
      return;
    }
    throw error;
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  for (const [name, type] of COLUMNS) {
    await safeAddColumn(db, "refresh_tokens", name, type);
  }
  // Backs the one-hop revoke cascade: session revoked -> its tokens revoked.
  await safeCreateIndex(db);
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
  try {
    await db.schema.dropIndex("idx_refresh_tokens_session_id").execute();
  } catch {
    // Index may not exist; the column drops below are what matter.
  }
  for (const [name] of COLUMNS) {
    await safeDropColumn(db, "refresh_tokens", name);
  }
}
