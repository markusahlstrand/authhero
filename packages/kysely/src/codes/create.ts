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
        // Numeric twin of expires_at, indexed so retention sweeps are cheap.
        // Not part of the Code type — storage detail only.
        expires_at_ts: new Date(createdCode.expires_at).getTime(),
      })
      .execute();

    return createdCode;
  };
}
