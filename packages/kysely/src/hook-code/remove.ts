import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("hook_code")
      .where("hook_code.tenant_id", "=", tenant_id)
      .where("hook_code.id", "=", id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
