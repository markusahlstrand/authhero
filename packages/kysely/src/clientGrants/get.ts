import { Kysely } from "kysely";
import { ClientGrant } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
  ): Promise<ClientGrant | null> => {
    const result = await db
      .selectFrom("client_grants")
      .selectAll()
      .where("client_grants.tenant_id", "=", tenant_id)
      .where("client_grants.id", "=", id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    const clientGrant: ClientGrant = {
      id: result.id,
      client_id: result.client_id,
      audience: result.audience,
      scope: result.scope ? JSON.parse(result.scope) : [],
      organization_usage: result.organization_usage as "deny" | "allow" | "require" | undefined,
      // Convert integers back to booleans for API response (with defaults)
      allow_any_organization: result.allow_any_organization !== undefined 
        ? Boolean(result.allow_any_organization) 
        : false,
      is_system: result.is_system !== undefined 
        ? Boolean(result.is_system) 
        : false,
      subject_type: result.subject_type as "client" | "user" | undefined,
      authorization_details_types: result.authorization_details_types
        ? JSON.parse(result.authorization_details_types)
        : [],
      created_at: result.created_at,
      updated_at: result.updated_at,
    };

    return removeNullProperties(clientGrant);
  };
}
