import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<boolean> => {
    const results = await db
      .deleteFrom("refresh_tokens")
      .where("tenant_id", "=", tenant_id)
      .where("refresh_tokens.id", "=", id)
      .execute();

    return !!results.length;
  };
}
