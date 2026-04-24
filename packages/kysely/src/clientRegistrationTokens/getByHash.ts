import { Kysely } from "kysely";
import { ClientRegistrationToken } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { rowToToken } from "./row-mapper";

export function getByHash(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    token_hash: string,
  ): Promise<ClientRegistrationToken | null> => {
    const row = await db
      .selectFrom("client_registration_tokens")
      .where("tenant_id", "=", tenant_id)
      .where("token_hash", "=", token_hash)
      .selectAll()
      .executeTakeFirst();

    return row ? rowToToken(row) : null;
  };
}
