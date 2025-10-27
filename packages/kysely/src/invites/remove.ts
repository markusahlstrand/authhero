import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenantId: string, id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("invites")
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    return result.numDeletedRows > 0n;
  };
}
