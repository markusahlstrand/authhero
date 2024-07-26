import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, code_id: string) => {
    const result = await db
      .deleteFrom("codes")
      .where("codes.tenant_id", "=", tenant_id)
      .where("codes.code_id", "=", code_id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
