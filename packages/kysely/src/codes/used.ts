import { Kysely } from "kysely";
import { Database } from "../db";

export function used(db: Kysely<Database>) {
  return async (tenant_id: string, code_id: string) => {
    const result = await db
      .updateTable("codes")
      .set({ used_at: new Date().toISOString() })
      .where("codes.tenant_id", "=", tenant_id)
      .where("codes.code_id", "=", code_id)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  };
}
