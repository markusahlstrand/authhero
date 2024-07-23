import { Kysely } from "kysely";
import { Database } from "../db";
import { Password, PasswordInsert } from "@authhero/adapter-interfaces";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, password: PasswordInsert) => {
    const createdPassword: Password = {
      ...password,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db
      .insertInto("passwords")
      .values({
        ...createdPassword,
        tenant_id,
      })
      .execute();

    return createdPassword;
  };
}
