import { Kysely } from "kysely";
import { Database } from "../db";
import { Password } from "@authhero/adapter-interfaces";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    limit?: number,
  ): Promise<Password[]> => {
    let query = db
      .selectFrom("passwords")
      .where("passwords.tenant_id", "=", tenant_id)
      .where("passwords.user_id", "=", user_id)
      .orderBy("created_at", "desc");

    if (limit) {
      query = query.limit(limit);
    }

    const results = await query.selectAll().execute();

    return results.map(({ tenant_id: as, ...password }) => ({
      ...password,
      is_current: !!password.is_current,
    }));
  };
}
