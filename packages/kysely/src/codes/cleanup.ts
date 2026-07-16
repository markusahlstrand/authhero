import { Kysely } from "kysely";
import { Database } from "../db";
import { toExpiresAtTs } from "./expires-at-ts";

export function cleanupCodes(db: Kysely<Database>) {
  return async (olderThan: string): Promise<number> => {
    // Two separate statements rather than one `OR`. MySQL frequently declines
    // to index_merge across OR'd predicates and falls back to a full scan —
    // which is the exact cost this table's index exists to avoid. Split, each
    // statement gets a clean single-predicate index range.
    const byTimestamp = await db
      .deleteFrom("codes")
      .where("expires_at_ts", "<", toExpiresAtTs(olderThan))
      .executeTakeFirst();

    // Rows whose twin was never written — inserted by an app version older
    // than the migration that added the column, during a deploy window.
    // Without this they would never be swept. `expires_at_ts IS NULL` is an
    // indexed lookup, and ISO-8601 compares lexicographically in chronological
    // order, so the varchar comparison is equivalent to the numeric one.
    //
    // Once no deployment runs pre-migration code, this sweeps nothing and can
    // be dropped.
    const byIsoFallback = await db
      .deleteFrom("codes")
      .where("expires_at_ts", "is", null)
      .where("expires_at", "<", olderThan)
      .executeTakeFirst();

    return (
      Number(byTimestamp.numDeletedRows) + Number(byIsoFallback.numDeletedRows)
    );
  };
}
