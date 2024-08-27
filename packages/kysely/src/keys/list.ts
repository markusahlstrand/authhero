import { Kysely } from "kysely";
import { Database } from "../db";
import { SigningKey } from "@authhero/adapter-interfaces";

export function list(db: Kysely<Database>) {
  return async (): Promise<SigningKey[]> => {
    const keys = await db
      .selectFrom("keys")
      .where("revoked_at", "is", null)
      .selectAll()
      .execute();

    return keys;
  };
}
