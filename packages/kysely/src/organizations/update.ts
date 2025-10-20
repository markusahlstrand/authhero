import { Kysely } from "kysely";
import { Database } from "../db";
import { OrganizationInsert } from "@authhero/adapter-interfaces";
import { stringifyProperties } from "../helpers/stringify";

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
    stringifyProperties(
      params,
      ["branding", "metadata", "enabled_connections", "token_quota"],
      updateData,
    );

    const result = await db
      .updateTable("organizations")
      .set(updateData)
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .execute();

    return result.length > 0;
  };
}
