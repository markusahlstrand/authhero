import { Kysely } from "kysely";
import { ClientRegistrationToken } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { rowToToken } from "./row-mapper";

export function listByClient(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    client_id: string,
  ): Promise<ClientRegistrationToken[]> => {
    const rows = await db
      .selectFrom("client_registration_tokens")
      .where("tenant_id", "=", tenant_id)
      .where("client_id", "=", client_id)
      .orderBy("created_at_ts", "desc")
      .selectAll()
      .execute();

    return rows.map(rowToToken);
  };
}
