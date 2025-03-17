import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<boolean> => {
    const results = await db
      .deleteFrom("sessions")
      .where("tenant_id", "=", tenant_id)
      .where("sessions.id", "=", id)
      .execute();

    return !!results.length;
  };
}
