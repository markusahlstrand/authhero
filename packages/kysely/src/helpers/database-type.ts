import { Kysely, sql } from "kysely";
import { Database } from "../db";

export type DatabaseType = "mysql" | "sqlite";

/**
 * Probe which engine the adapter is talking to.
 *
 * `VERSION()` exists on MySQL and not on SQLite, so a thrown statement is the
 * signal. Callers should memoize the result per adapter instance — the answer
 * cannot change for a given `Kysely` connection.
 *
 * This matters for chunked deletes: `DELETE ... LIMIT` requires SQLite to be
 * built with `SQLITE_ENABLE_UPDATE_DELETE_LIMIT`, which is not the default, so
 * SQLite deployments take the unchunked path instead.
 */
export async function getDatabaseType(
  db: Kysely<Database>,
): Promise<DatabaseType> {
  try {
    await sql`SELECT VERSION()`.execute(db);
    return "mysql";
  } catch {
    return "sqlite";
  }
}
