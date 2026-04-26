import { Kysely } from "kysely";
import { Database } from "../db";
import { isoToDbDate } from "../utils/dateConversion";

export function revoke(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
    revoked_at: string,
  ): Promise<boolean> => {
    const result = await db
      .updateTable("client_registration_tokens")
      .set({ revoked_at_ts: isoToDbDate(revoked_at) })
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", id)
      .where("revoked_at_ts", "is", null)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  };
}
