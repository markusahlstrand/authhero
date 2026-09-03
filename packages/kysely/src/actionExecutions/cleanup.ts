import { Kysely } from "kysely";
import { Database } from "../db";
import { DatabaseType, getDatabaseType } from "../helpers/database-type";

// Rows deleted per statement on MySQL. Bounds the lock footprint of a single
// DELETE so the first sweep of a long-uncleaned table cannot exceed
// PlanetScale's per-statement limits.
const CHUNK = 50_000;

export function cleanup(db: Kysely<Database>) {
  let dbType: DatabaseType | undefined;

  return async (olderThan: string): Promise<number> => {
    // Unlike `codes`, this table has always written the numeric timestamp, so
    // there is no varchar fallback sweep — one indexed range delete suffices.
    const cutoff = Date.parse(olderThan);
    if (Number.isNaN(cutoff)) {
      throw new Error(`Invalid olderThan date: ${olderThan}`);
    }

    dbType ??= await getDatabaseType(db);

    if (dbType === "sqlite") {
      // SQLite is not built with SQLITE_ENABLE_UPDATE_DELETE_LIMIT by
      // default, so DELETE ... LIMIT is unavailable. SQLite deployments are
      // local/dev and small, so an unchunked delete is fine.
      const result = await db
        .deleteFrom("action_executions")
        .where("created_at_ts", "<", cutoff)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    }

    let total = 0;
    let deleted = CHUNK;
    while (deleted >= CHUNK) {
      const result = await db
        .deleteFrom("action_executions")
        .where("created_at_ts", "<", cutoff)
        .limit(CHUNK)
        .executeTakeFirst();
      deleted = Number(result.numDeletedRows);
      total += deleted;
    }

    return total;
  };
}
