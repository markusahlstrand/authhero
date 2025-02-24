import { Kysely } from "kysely";
import { CustomDomain } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    custom_domain_id: string,
    params: Partial<CustomDomain>,
  ): Promise<boolean> => {
    const sqlCustomDomain = {
      ...params,
      updated_at: new Date().toISOString(),
      primary: params.primary ? 1 : 0,
    };

    const results = await db
      .updateTable("custom_domains")
      .set(sqlCustomDomain)
      .where("custom_domains.tenant_id", "=", tenant_id)
      .where("custom_domains.custom_domain_id", "=", custom_domain_id)
      .execute();

    return results.length > 0;
  };
}
