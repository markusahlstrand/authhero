import { LoginInsert } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Database } from "../db";
import { flattenObject } from "../flattten";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, login: LoginInsert) => {
    const createdLogin = {
      id: nanoid(),
      ...login,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db
      .insertInto("logins")
      .values({ ...flattenObject(createdLogin), tenant_id })
      .execute();

    return createdLogin;
  };
}
