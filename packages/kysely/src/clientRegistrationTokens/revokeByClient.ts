import { Kysely } from "kysely";
import { Database } from "../db";
import { isoToDbDate } from "../utils/dateConversion";

export function revokeByClient(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    client_id: string,
    revoked_at: string,
  ): Promise<number> => {
    const result = await db
      .updateTable("client_registration_tokens")
      .set({ revoked_at_ts: isoToDbDate(revoked_at) })
      .where("tenant_id", "=", tenant_id)
      .where("client_id", "=", client_id)
      .where("revoked_at_ts", "is", null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows);
  };
}
