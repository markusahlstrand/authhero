// @ts-nocheck - Migration touches columns during the window in which they are
// being added, so they are not yet consistently present in the Database type.
import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
import { migrationLog, migrationWarn } from "../log";

/**
 * Give `codes` the retention story every other expiring table already has.
 *
 * `codes` rows are short-lived (minutes) but nothing ever pruned them, so
 * deployments accumulate them forever — one real deployment reached ~2.5M rows
 * of which ~100% were expired. The table also never received the numeric
 * `expires_at_ts` + index that the session tables got in
 * 2026-01-15T10:00:00_session_add_timestamp_columns, so even a hand-rolled
 * sweep was a full table scan.
 *
 * Order matters here:
 *
 *   1. Prune expired rows FIRST, using the existing varchar `expires_at`.
 *      ISO-8601 compares lexicographically in chronological order, so this is
 *      correct without an index, and the `LIMIT` lets each chunk stop scanning
 *      as soon as it fills — cheap precisely because most rows are expired.
 *   2. Only then add the column and index, so the DDL runs against the small
 *      remainder (hundreds of rows) rather than millions.
 *   3. Backfill `expires_at_ts` for what survived, which is now trivial.
 *
 * On a fresh database steps 1 and 3 are no-ops.
 *
 * `expires_at` remains the canonical value that the adapter reads and writes;
 * `expires_at_ts` is a write-side twin that exists purely so retention sweeps
 * have a cheap indexed column, mirroring the session tables.
 */

const CHUNK = 50_000;
const BACKFILL_BATCH = 500;

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

// Ignores "duplicate column" errors (errno 1060 on MySQL) so the migration is
// safe to re-run against a database that already has the column.
async function safeAddColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema
      .alterTable(tableName)
      .addColumn(columnName, "bigint")
      .execute();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("1060") ||
        error.message.includes("duplicate column"))
    ) {
      migrationLog(
        `  Column ${tableName}.${columnName} already exists, skipping`,
      );
      return;
    }
    throw error;
  }
}

// Counterpart to safeAddColumn: without this, re-running against a database
// that already has the column would skip the column but still fail here on
// "Duplicate key name" (errno 1061), making safeAddColumn's tolerance useless.
async function safeCreateIndex(
  db: Kysely<Database>,
  indexName: string,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema
      .createIndex(indexName)
      .on(tableName)
      .column(columnName)
      .execute();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("1061") ||
        error.message.toLowerCase().includes("already exists"))
    ) {
      migrationLog(`  Index ${indexName} already exists, skipping`);
      return;
    }
    throw error;
  }
}

async function pruneExpiredCodes(
  db: Kysely<Database>,
  dbType: "mysql" | "sqlite",
): Promise<number> {
  // Prune strictly what is already expired as of now. This is a retention
  // sweep of dead rows, not a policy decision, so there is no grace window.
  const cutoff = new Date().toISOString();
  let total = 0;

  if (dbType === "sqlite") {
    // SQLite is not built with SQLITE_ENABLE_UPDATE_DELETE_LIMIT by default,
    // so DELETE ... LIMIT is unavailable. SQLite deployments are local/dev and
    // small, so an unchunked delete is fine.
    const result = await db
      .deleteFrom("codes")
      .where("expires_at", "<", cutoff)
      .executeTakeFirst();
    total = Number(result.numDeletedRows);
  } else {
    let deleted = CHUNK;
    while (deleted >= CHUNK) {
      const result = await db
        .deleteFrom("codes")
        .where("expires_at", "<", cutoff)
        .limit(CHUNK)
        .executeTakeFirst();

      deleted = Number(result.numDeletedRows);
      total += deleted;

      if (deleted > 0) {
        migrationLog(`  Pruned ${total} expired codes row(s)...`);
      }
    }
  }

  return total;
}

async function backfillExpiresAtTs(db: Kysely<Database>): Promise<number> {
  let total = 0;

  while (true) {
    const rows = await db
      .selectFrom("codes")
      .select(["code_id", "code_type", "tenant_id", "expires_at"])
      .where("expires_at_ts", "is", null)
      .limit(BACKFILL_BATCH)
      .execute();

    if (rows.length === 0) break;

    for (const row of rows) {
      const parsed = Date.parse(row.expires_at);
      await db
        .updateTable("codes")
        // An unparseable expires_at means the row can never be swept by
        // timestamp. Treat it as already expired (0) so the next sweep
        // collects it rather than leaving it stranded forever.
        .set({ expires_at_ts: Number.isNaN(parsed) ? 0 : parsed })
        .where("code_id", "=", row.code_id)
        .where("code_type", "=", row.code_type)
        .where("tenant_id", "=", row.tenant_id)
        .execute();
    }

    total += rows.length;

    if (rows.length < BACKFILL_BATCH) break;
  }

  return total;
}

export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  // ---- STEP 1: prune before touching the schema ----
  try {
    const pruned = await pruneExpiredCodes(db, dbType);
    migrationLog(
      pruned === 0
        ? "  No expired codes to prune"
        : `  Pruned ${pruned} expired codes row(s) total`,
    );
  } catch (error) {
    // A failed prune must not block the schema change — the index and the
    // cleanup helper are what stop the table growing again, and the first
    // scheduled sweep will clear whatever is left behind.
    migrationWarn(
      `  Warning: Could not prune expired codes: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // ---- STEP 2: add the numeric twin + its index ----
  await safeAddColumn(db, "codes", "expires_at_ts");

  await safeCreateIndex(
    db,
    "idx_codes_expires_at_ts",
    "codes",
    "expires_at_ts",
  );

  // ---- STEP 3: backfill the (now small) remainder ----
  try {
    const backfilled = await backfillExpiresAtTs(db);
    migrationLog(
      backfilled === 0
        ? "  No codes rows needed an expires_at_ts backfill"
        : `  Backfilled expires_at_ts for ${backfilled} codes row(s)`,
    );
  } catch (error) {
    migrationWarn(
      `  Warning: Could not backfill codes.expires_at_ts: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// PlanetScale doesn't support IF EXISTS on these, so tolerate "doesn't exist".
async function safeDropIndex(
  db: Kysely<Database>,
  indexName: string,
  tableName: string,
): Promise<void> {
  try {
    await db.schema.dropIndex(indexName).on(tableName).execute();
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("1091")) return;
    throw error;
  }
}

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
  // Pruned rows are not restored — they were expired and unreadable anyway.
  await safeDropIndex(db, "idx_codes_expires_at_ts", "codes");
  await safeDropColumn(db, "codes", "expires_at_ts");
}
