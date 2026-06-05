import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("grants")
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}

export function removeByUser(db: Kysely<Database>) {
  return async (tenant_id: string, user_id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("grants")
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", user_id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
