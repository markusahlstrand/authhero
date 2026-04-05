import { Kysely } from "kysely";
import { Database } from "../db";

export function claimOutboxEvents(db: Kysely<Database>) {
  return async (
    ids: string[],
    workerId: string,
    leaseMs: number,
  ): Promise<string[]> => {
    if (ids.length === 0) return [];

    const now = new Date().toISOString();
    const claimExpiresAt = new Date(Date.now() + leaseMs).toISOString();

    // Atomically claim only unclaimed (or expired-lease) rows
    await db
      .updateTable("outbox_events")
      .set({
        claimed_by: workerId,
        claim_expires_at: claimExpiresAt,
      })
      .where("id", "in", ids)
      .where("processed_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("claimed_by", "is", null),
          eb("claim_expires_at", "<=", now),
        ]),
      )
      .execute();

    // Read back which rows this worker actually claimed
    const claimed = await db
      .selectFrom("outbox_events")
      .select("id")
      .where("id", "in", ids)
      .where("claimed_by", "=", workerId)
      .where("claim_expires_at", "=", claimExpiresAt)
      .execute();

    return claimed.map((row) => row.id);
  };
}
