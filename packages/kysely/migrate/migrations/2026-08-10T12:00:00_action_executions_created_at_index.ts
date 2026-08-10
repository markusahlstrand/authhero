import { Kysely } from "kysely";
import { Database } from "../../src/db";
import { migrationLog } from "../log";

/**
 * Index `action_executions.created_at_ts` so retention sweeps are an index
 * range scan instead of a full table scan.
 *
 * A row is written for every action execution and, until the `cleanup`
 * adapter method that ships with this migration, nothing ever pruned them —
 * so the table grows without bound on any deployment that runs actions. The
 * baseline created it with only the primary key and a (tenant_id, id) lookup
 * index.
 *
 * Unlike the codes migration, this one does not prune before adding the
 * index: expired codes are dead by definition, but how long execution history
 * is worth keeping is a per-deployment policy decision that belongs to the
 * scheduled `runRetention` call. MySQL builds the index online, and the
 * runtime sweep deletes in bounded chunks, so a large backlog is safe either
 * way.
 */

// Ignores "duplicate key name" (errno 1061 on MySQL) so the migration is safe
// to re-run against a database that already has the index.
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

export async function up(db: Kysely<Database>): Promise<void> {
  await safeCreateIndex(
    db,
    "idx_action_executions_created_at_ts",
    "action_executions",
    "created_at_ts",
  );
}

// PlanetScale doesn't support IF EXISTS here, so tolerate "doesn't exist".
export async function down(db: Kysely<Database>): Promise<void> {
  try {
    await db.schema
      .dropIndex("idx_action_executions_created_at_ts")
      .on("action_executions")
      .execute();
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("1091")) return;
    throw error;
  }
}
