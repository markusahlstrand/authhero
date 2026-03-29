import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, method_id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("authentication_methods")
      .where("authentication_methods.tenant_id", "=", tenant_id)
      .where("authentication_methods.id", "=", method_id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
