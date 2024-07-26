import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, login_id: string): Promise<boolean> => {
    const results = await db
      .deleteFrom("logins")
      .where("logins.tenant_id", "=", tenant_id)
      .where("logins.id", "=", login_id)
      .execute();

    return results.length > 0;
  };
}
