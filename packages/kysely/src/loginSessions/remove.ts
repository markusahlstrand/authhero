import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, login_id: string): Promise<boolean> => {
    const results = await db
      .deleteFrom("login_sessions")
      .where("login_sessions.tenant_id", "=", tenant_id)
      .where("login_sessions.id", "=", login_id)
      .execute();

    return results.length > 0;
  };
}
