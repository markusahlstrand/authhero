import { Kysely } from "kysely";
import { CustomDomain } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    custom_domain_id: string,
    params: Partial<CustomDomain>,
  ): Promise<boolean> => {
    const { verification, domain_metadata, primary, ...rest } = params;
    const sqlCustomDomain = {
      ...rest,
      updated_at: new Date().toISOString(),
      ...(primary !== undefined && { primary: primary ? 1 : 0 }),
      ...(domain_metadata !== undefined && {
        domain_metadata: JSON.stringify(domain_metadata),
      }),
      ...(verification !== undefined && {
        verification: JSON.stringify(verification) as any,
      }),
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
