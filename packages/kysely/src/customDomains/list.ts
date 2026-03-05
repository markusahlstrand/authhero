import { Kysely } from "kysely";
import { Database } from "../db";
import { parseJsonIfDefined } from "../helpers/parse";

export function list(db: Kysely<Database>) {
  return async (tenantId: string) => {
    const customDomains = await db
      .selectFrom("custom_domains")
      .where("custom_domains.tenant_id", "=", tenantId)
      .selectAll()
      .execute();

    return customDomains.map((customDomain) => ({
      ...customDomain,
      primary: customDomain.primary === 1,
      domain_metadata: parseJsonIfDefined(customDomain.domain_metadata, undefined),
    }));
  };
}
