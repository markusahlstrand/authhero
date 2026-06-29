import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import {
  CustomDomain,
  CustomDomainInsert,
  CreateOptions,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: CustomDomainInsert,
    options?: CreateOptions,
  ): Promise<CustomDomain> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const customDomain: CustomDomain = {
      status: "pending",
      primary: false,
      ...params,
      // Computed id must win over any `params.custom_domain_id` so an imported
      // id (importMetadata.id) is preserved; spreading params first would let it
      // clobber the intended precedence.
      custom_domain_id:
        importMetadata?.id || params.custom_domain_id || nanoid(),
    };

    await db
      .insertInto("custom_domains")
      .values({
        ...customDomain,
        created_at: importMetadata?.created_at ?? now,
        updated_at: importMetadata?.updated_at ?? now,
        tenant_id,
        primary: customDomain.primary ? 1 : 0,
        domain_metadata: customDomain.domain_metadata
          ? JSON.stringify(customDomain.domain_metadata)
          : undefined,
      })
      .execute();

    return customDomain;
  };
}
