import { Kysely } from "kysely";
import { Database } from "../db";

export function cleanupCodes(db: Kysely<Database>) {
  return async (olderThan: string): Promise<number> => {
    const cutoffTs = new Date(olderThan).getTime();

    const result = await db
      .deleteFrom("codes")
      .where((eb) =>
        eb.or([
          // Fast path: the indexed numeric twin.
          eb("expires_at_ts", "<", cutoffTs),
          // Fallback for rows whose twin was never written — i.e. inserted by
          // an app version older than the migration that added the column,
          // during a deploy window. Without this they would never be swept.
          // ISO-8601 compares lexicographically in chronological order, so the
          // varchar comparison is equivalent, and `expires_at_ts IS NULL` is
          // itself indexed, so this branch stays cheap.
          eb.and([
            eb("expires_at_ts", "is", null),
            eb("expires_at", "<", olderThan),
          ]),
        ]),
      )
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  };
}
