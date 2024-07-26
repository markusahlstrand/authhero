import { Kysely } from "kysely";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";
import { CodeType } from "@authhero/adapter-interfaces";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, code_id: string, code_type: CodeType) => {
    const code = await db
      .selectFrom("codes")
      .where("codes.tenant_id", "=", tenant_id)
      .where("codes.code_id", "=", code_id)
      .where("codes.code_type", "=", code_type)
      .selectAll()
      .executeTakeFirst();

    if (!code) {
      return null;
    }

    return removeNullProperties(code);
  };
}
