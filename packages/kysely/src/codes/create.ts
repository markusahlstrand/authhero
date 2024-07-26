import { Code, CodeInsert } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, code: CodeInsert) => {
    const createdCode: Code = {
      ...code,
      created_at: new Date().toISOString(),
    };

    await db
      .insertInto("codes")
      .values({
        ...createdCode,
        tenant_id,
      })
      .execute();

    return createdCode;
  };
}
