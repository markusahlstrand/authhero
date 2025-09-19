import { Kysely } from "kysely";
import { ClientGrantInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
    clientGrant: Partial<ClientGrantInsert>,
  ): Promise<boolean> => {
    const now = new Date().toISOString();

    const {
      scope,
      authorization_details_types,
      ...rest
    } = clientGrant;

    const dbUpdate: any = {
      ...rest,
      updated_at: now,
    };

    if (scope !== undefined) {
      dbUpdate.scope = JSON.stringify(scope);
    }
    if (authorization_details_types !== undefined) {
      dbUpdate.authorization_details_types = JSON.stringify(authorization_details_types);
    }

    // Convert booleans to integers for database storage
    if (rest.allow_any_organization !== undefined) {
      dbUpdate.allow_any_organization = rest.allow_any_organization ? 1 : 0;
    }
    if (rest.is_system !== undefined) {
      dbUpdate.is_system = rest.is_system ? 1 : 0;
    }

    const result = await db
      .updateTable("client_grants")
      .set(dbUpdate)
      .where("client_grants.tenant_id", "=", tenant_id)
      .where("client_grants.id", "=", id)
      .executeTakeFirst();

    return (result.numUpdatedRows ?? 0n) > 0n;
  };
}
