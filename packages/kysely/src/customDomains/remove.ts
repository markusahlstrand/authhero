import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenantId: string, custom_domain_id: string) => {
    const results = await db
      .deleteFrom("custom_domains")
      .where("custom_domains.tenant_id", "=", tenantId)
      .where("custom_domains.custom_domain_id", "=", custom_domain_id)
      .execute();

    return results.length > 0;
  };
}
