import { Kysely } from "kysely";
import { Database } from "../db";
import { parseJsonIfDefined } from "../helpers/parse";

export function getByDomain(db: Kysely<Database>) {
  return async (domain: string) => {
    const customDomain = await db
      .selectFrom("custom_domains")
      .where("custom_domains.domain", "=", domain)
      .selectAll()
      .executeTakeFirst();

    if (!customDomain) {
      return null;
    }

    return {
      ...customDomain,
      primary: customDomain.primary === 1,
      domain_metadata: parseJsonIfDefined(
        customDomain.domain_metadata,
        undefined,
      ),
      // Must be parsed here exactly as in `get`: a caller that reaches a domain
      // by hostname gets the same shape as one that reaches it by id.
      verification: parseJsonIfDefined(customDomain.verification, undefined),
    };
  };
}
