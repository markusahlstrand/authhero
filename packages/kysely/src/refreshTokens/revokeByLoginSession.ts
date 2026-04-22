import { Kysely } from "kysely";
import { Database } from "../db";
import { isoToDbDate } from "../utils/dateConversion";

export function revokeByLoginSession(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    login_session_id: string,
    revoked_at: string,
  ): Promise<number> => {
    const revokedAtTs = isoToDbDate(revoked_at);

    const results = await db
      .updateTable("refresh_tokens")
      .set({ revoked_at_ts: revokedAtTs })
      .where("tenant_id", "=", tenant_id)
      .where("login_id", "=", login_session_id)
      .where("revoked_at_ts", "is", null)
      .executeTakeFirst();

    return Number(results.numUpdatedRows ?? 0);
  };
}
