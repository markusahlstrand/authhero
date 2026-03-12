import { Kysely } from "kysely";
import { Database } from "../db";
import { parseJsonIfDefined } from "../helpers/parse";

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
      domain_metadata: parseJsonIfDefined(customDomain.domain_metadata, undefined),
      verification: parseJsonIfDefined(customDomain.verification as any, undefined),
    };
  };
}
