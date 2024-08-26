import { SigningKey } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (key: SigningKey) => {
    await db
      .insertInto("keys")
      .values({ ...key, created_at: new Date().toDateString() })
      .execute();
  };
}
