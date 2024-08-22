import { Kysely } from "kysely";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Code, CodeType } from "@authhero/adapter-interfaces";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    code_id: string,
    code_type: CodeType,
  ): Promise<Code | null> => {
    let query = db
      .selectFrom("codes")
      .where("codes.code_id", "=", code_id)
      .where("codes.code_type", "=", code_type)
      .where("codes.expires_at", ">", new Date().toISOString());

    // The tenant_id isn't always avaialble when using the same domain
    if (tenant_id.length) {
      query = query.where("codes.tenant_id", "=", tenant_id);
    }

    const code = await query.selectAll().executeTakeFirst();

    if (!code) {
      return null;
    }

    return removeNullProperties(code);
  };
}
