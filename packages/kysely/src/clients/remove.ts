import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, client_id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("clients")
      .where("clients.tenant_id", "=", tenant_id)
      .where("clients.client_id", "=", client_id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
