import { Kysely } from "kysely";
import { UserConsent } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    client_id: string,
  ): Promise<UserConsent | null> => {
    const row = await db
      .selectFrom("user_consents")
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", user_id)
      .where("client_id", "=", client_id)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      user_id: row.user_id,
      client_id: row.client_id,
      scopes: row.scopes ? JSON.parse(row.scopes) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  };
}
