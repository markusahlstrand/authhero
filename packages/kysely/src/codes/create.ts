import { Code, CodeInsert } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { toExpiresAtTs } from "./expires-at-ts";

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
        expires_at_ts: toExpiresAtTs(createdCode.expires_at),
      })
      .execute();

    return createdCode;
  };
}
