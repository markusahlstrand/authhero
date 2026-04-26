import { Kysely } from "kysely";
import { Database } from "../db";
import { isoToDbDate } from "../utils/dateConversion";

export function markUsed(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
    used_at: string,
  ): Promise<boolean> => {
    const result = await db
      .updateTable("client_registration_tokens")
      .set({ used_at_ts: isoToDbDate(used_at) })
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", id)
      .where("used_at_ts", "is", null)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  };
}
