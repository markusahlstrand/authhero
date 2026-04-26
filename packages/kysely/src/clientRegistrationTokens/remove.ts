import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("client_registration_tokens")
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
