import { Kysely } from "kysely";
import { Database } from "../db";
import { toExpiresAtTs } from "./expires-at-ts";
import { DatabaseType, getDatabaseType } from "../helpers/database-type";

// Rows deleted per statement on MySQL. Bounds the lock footprint of a single
// DELETE so the first sweep of a long-uncleaned table cannot exceed
// PlanetScale's per-statement limits — the same bound the action_executions
// sweep applies, and `codes` is the higher-volume table of the two.
const CHUNK = 50_000;

/**
 * Run one delete repeatedly until a pass removes fewer rows than the chunk
 * size. On SQLite `DELETE ... LIMIT` is unavailable, so the statement runs
 * once, unbounded — those deployments are local/dev and small.
 */
async function drain(
  deleteChunk: (limit?: number) => Promise<number>,
  chunked: boolean,
): Promise<number> {
  if (!chunked) {
    return deleteChunk();
  }

  let total = 0;
  let deleted = CHUNK;
  while (deleted >= CHUNK) {
    deleted = await deleteChunk(CHUNK);
    total += deleted;
  }
  return total;
}

export function cleanupCodes(db: Kysely<Database>) {
  let dbType: DatabaseType | undefined;

  return async (olderThan: string): Promise<number> => {
    dbType ??= await getDatabaseType(db);
    const chunked = dbType === "mysql";

    // Two separate statements rather than one `OR`. MySQL frequently declines
    // to index_merge across OR'd predicates and falls back to a full scan —
    // which is the exact cost this table's index exists to avoid. Split, each
    // statement gets a clean single-predicate index range.
    const byTimestamp = await drain(async (limit) => {
      let query = db
        .deleteFrom("codes")
        .where("expires_at_ts", "<", toExpiresAtTs(olderThan));

      if (limit !== undefined) {
        query = query.limit(limit);
      }

      const result = await query.executeTakeFirst();
      return Number(result.numDeletedRows);
    }, chunked);

    // Rows whose twin was never written — inserted by an app version older
    // than the migration that added the column, during a deploy window.
    // Without this they would never be swept. `expires_at_ts IS NULL` is an
    // indexed lookup, and ISO-8601 compares lexicographically in chronological
    // order, so the varchar comparison is equivalent to the numeric one.
    //
    // Once no deployment runs pre-migration code, this sweeps nothing and can
    // be dropped.
    const byIsoFallback = await drain(async (limit) => {
      let query = db
        .deleteFrom("codes")
        .where("expires_at_ts", "is", null)
        .where("expires_at", "<", olderThan);

      if (limit !== undefined) {
        query = query.limit(limit);
      }

      const result = await query.executeTakeFirst();
      return Number(result.numDeletedRows);
    }, chunked);

    return byTimestamp + byIsoFallback;
  };
}
