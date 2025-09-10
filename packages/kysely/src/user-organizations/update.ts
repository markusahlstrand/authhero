import { Kysely } from "kysely";
import { Database } from "../db";
import { UserOrganizationInsert } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (
    tenantId: string,
    id: string,
    params: Partial<UserOrganizationInsert>,
  ): Promise<boolean> => {
    const updateData = {
      ...params,
      updated_at: new Date().toISOString(),
    };

    const result = await db
      .updateTable("user_organizations")
      .set(updateData)
      .where("id", "=", id)
      .where("tenant_id", "=", tenantId)
      .execute();

    return result.length > 0;
  };
}
