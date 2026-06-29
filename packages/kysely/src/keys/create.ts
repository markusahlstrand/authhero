import { SigningKey, CreateOptions } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (key: SigningKey, options?: CreateOptions) => {
    const importMetadata = options?.importMetadata;
    await db
      .insertInto("keys")
      .values({
        ...key,
        kid: importMetadata?.id ?? key.kid,
        created_at: importMetadata?.created_at ?? new Date().toDateString(),
      })
      .execute();
  };
}
