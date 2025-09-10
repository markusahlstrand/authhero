import { Kysely } from "kysely";
import { Database } from "../db";
import { Organization } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";

export function get(db: Kysely<Database>) {
  return async (tenantId: string, id: string): Promise<Organization | null> => {
    const result = await db
      .selectFrom("organizations")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return removeNullProperties({
      ...result,
      branding: result.branding ? JSON.parse(result.branding) : {},
      metadata: result.metadata ? JSON.parse(result.metadata) : {},
      enabled_connections: result.enabled_connections
        ? JSON.parse(result.enabled_connections)
        : [],
      token_quota: result.token_quota ? JSON.parse(result.token_quota) : {},
    }) as Organization;
  };
}
