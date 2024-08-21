import { Kysely } from "kysely";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Code, CodeType } from "@authhero/adapter-interfaces";

export function get(db: Kysely<Database>) {
  return async (
    _: string,
    code_id: string,
    code_type: CodeType,
  ): Promise<Code | null> => {
    const code = await db
      .selectFrom("codes")
      // We currently don't have the tenant_id in all places
      // .where("codes.tenant_id", "=", tenant_id)
      .where("codes.code_id", "=", code_id)
      .where("codes.code_type", "=", code_type)
      .where("codes.expires_at", ">", new Date().toISOString())
      .selectAll()
      .executeTakeFirst();

    if (!code) {
      return null;
    }

    return removeNullProperties(code);
  };
}
