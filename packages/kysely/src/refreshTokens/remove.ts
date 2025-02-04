import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, session_id: string): Promise<boolean> => {
    const results = await db
      .updateTable("refresh_tokens")
      .set({ revoked_at: new Date().toISOString() })
      .where("tenant_id", "=", tenant_id)
      .where("refresh_tokens.session_id", "=", session_id)
      .where("refresh_tokens.revoked_at", "is", null)
      .execute();

    return !!results.length;
  };
}
