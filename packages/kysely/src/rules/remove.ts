import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, rule_id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("rules")
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", rule_id)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  };
}
