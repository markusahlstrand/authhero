import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenantId: string, id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("user_organizations")
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();

    return result.length > 0;
  };
}
