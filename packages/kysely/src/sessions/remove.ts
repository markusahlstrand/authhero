import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<boolean> => {
    const results = await db
      .deleteFrom("sessions_2")
      .where("tenant_id", "=", tenant_id)
      .where("sessions_2.id", "=", id)
      .execute();

    return !!results.length;
  };
}
