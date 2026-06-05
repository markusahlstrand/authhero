import { Kysely } from "kysely";
import { Grant } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    clientID: string,
    audience?: string,
  ): Promise<Grant | null> => {
    const row = await db
      .selectFrom("grants")
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", user_id)
      .where("client_id", "=", clientID)
      .where("audience", "=", audience ?? "")
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      user_id: row.user_id,
      clientID: row.client_id,
      audience: row.audience || undefined,
      scope: row.scope ? JSON.parse(row.scope) : [],
    };
  };
}
