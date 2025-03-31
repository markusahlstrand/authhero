import { Kysely } from "kysely";
import { Database } from "../db";

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
    };
  };
}
