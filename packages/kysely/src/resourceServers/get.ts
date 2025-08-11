import { Kysely } from "kysely";
import { ResourceServer } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
  ): Promise<ResourceServer | null> => {
    const row = await db
      .selectFrom("resource_servers")
      .selectAll()
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    const parsed: any = {
      ...row,
      scopes: row.scopes ? JSON.parse(row.scopes) : [],
      options: row.options ? JSON.parse(row.options) : {},
      skip_consent_for_verifiable_first_party_clients:
        !!row.skip_consent_for_verifiable_first_party_clients,
      allow_offline_access: !!row.allow_offline_access,
    };
    return parsed as ResourceServer;
  };
}
