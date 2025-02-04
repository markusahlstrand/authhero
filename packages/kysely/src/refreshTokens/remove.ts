import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, token: string): Promise<boolean> => {
    const results = await db
      .deleteFrom("refresh_tokens")
      .where("tenant_id", "=", tenant_id)
      .where("refresh_tokens.token", "=", token)
      .execute();

    return !!results.length;
  };
}
