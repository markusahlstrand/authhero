import { Kysely } from "kysely";
import { Database } from "../db";
import { UserOrganization } from "@authhero/adapter-interfaces";

export function get(db: Kysely<Database>) {
  return async (
    tenantId: string,
    id: string,
  ): Promise<UserOrganization | null> => {
    const result = await db
      .selectFrom("user_organizations")
      .selectAll()
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      user_id: result.user_id,
      organization_id: result.organization_id,
      created_at: result.created_at,
      updated_at: result.updated_at,
    };
  };
}
