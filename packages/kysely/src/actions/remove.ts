import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, action_id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("actions")
      .where("actions.id", "=", action_id)
      .where("actions.tenant_id", "=", tenant_id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
