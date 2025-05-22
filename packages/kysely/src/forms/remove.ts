import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, form_id: string): Promise<boolean> => {
    const { numDeletedRows } = await db
      .deleteFrom("forms")
      .where("id", "=", form_id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    return numDeletedRows > 0;
  };
}
