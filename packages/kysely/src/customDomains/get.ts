import { Kysely } from "kysely";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (tenantId: string, custom_domain_id: string) => {
    const customDomain = await db
      .selectFrom("custom_domains")
      .where("custom_domains.tenant_id", "=", tenantId)
      .where("custom_domains.custom_domain_id", "=", custom_domain_id)
      .selectAll()
      .executeTakeFirst();

    if (!customDomain) {
      return null;
    }

    return {
      ...customDomain,
      primary: customDomain.primary === 1,
    };
  };
}
