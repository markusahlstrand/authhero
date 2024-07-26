import { Code } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, code: Code) => {
    const createdCode = {
      ...code,
      tenant_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
