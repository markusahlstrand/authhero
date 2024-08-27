import { Kysely } from "kysely";
import { Database } from "../db";
import { SigningKey } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (kid: string, signingKey: Partial<Omit<SigningKey, "kid">>) => {
    const results = await db
      .updateTable("keys")
      .set(signingKey)
      .where("kid", "=", kid)
      .execute();

    return !!results.length;
  };
}
