import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, session_id: string): Promise<boolean> => {
    const results = await db
      .updateTable("sessions")
      .set({ deleted_at: new Date().toISOString() })
      .where("tenant_id", "=", tenant_id)
      .where("sessions.session_id", "=", session_id)
      .where("sessions.deleted_at", "is", null)
      .execute();

    return !!results.length;
  };
}
