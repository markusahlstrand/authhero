import { Kysely } from "kysely";
import { Database } from "../db";
import { OrganizationInsert } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (
    tenantId: string,
    id: string,
    params: Partial<OrganizationInsert>,
  ): Promise<boolean> => {
    const { branding, metadata, enabled_connections, token_quota, ...rest } =
      params;

    const updateData: any = {
      ...rest,
      updated_at: new Date().toISOString(),
    };

    // Convert complex objects to JSON strings
    if (branding !== undefined) {
      updateData.branding = JSON.stringify(branding);
    }
    if (metadata !== undefined) {
      updateData.metadata = JSON.stringify(metadata);
    }
    if (enabled_connections !== undefined) {
      updateData.enabled_connections = JSON.stringify(enabled_connections);
    }
    if (token_quota !== undefined) {
      updateData.token_quota = JSON.stringify(token_quota);
    }

    const result = await db
      .updateTable("organizations")
      .set(updateData)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();

    return result.length > 0;
  };
}
