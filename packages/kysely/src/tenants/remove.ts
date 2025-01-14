import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<boolean> => {
    const results = await db
      .deleteFrom("tenants")
      .where("tenants.id", "=", tenant_id)
      .execute();

    return results.length === 1;
  };
}
