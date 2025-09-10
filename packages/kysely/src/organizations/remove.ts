import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenantId: string, id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("organizations")
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();

    return result.length > 0;
  };
}
