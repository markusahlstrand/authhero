import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, permission_id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("permissions")
      .where("permissions.tenant_id", "=", tenant_id)
      .where("permissions.id", "=", permission_id)
      .executeTakeFirst();

    return Number(result.numDeletedRows) > 0;
  };
}
