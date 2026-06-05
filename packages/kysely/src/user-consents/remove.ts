import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    client_id: string,
  ): Promise<boolean> => {
    const result = await db
      .deleteFrom("user_consents")
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", user_id)
      .where("client_id", "=", client_id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
