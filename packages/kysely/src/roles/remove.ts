import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenantId: string, roleId: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("roles")
      .where("tenant_id", "=", tenantId)
      .where("id", "=", roleId)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  };
}
