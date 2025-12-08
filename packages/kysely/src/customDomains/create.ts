import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { CustomDomain, CustomDomainInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: CustomDomainInsert,
  ): Promise<CustomDomain> => {
    const customDomain: CustomDomain = {
      custom_domain_id: params.custom_domain_id || nanoid(),
      status: "pending",
      primary: false,
      ...params,
    };

    await db
      .insertInto("custom_domains")
      .values({
        ...customDomain,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tenant_id,
        primary: customDomain.primary ? 1 : 0,
      })
      .execute();

    return customDomain;
  };
}
