import { LoginSession, LoginSessionInsert } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, login: LoginSessionInsert) => {
    const createdLogin: LoginSession = {
      id: nanoid(),
      ...login,
      authorization_url: login.authorization_url?.slice(0, 1024),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_completed: !!login.login_completed,
    };

    await db
      .insertInto("login_sessions")
      .values({
        ...flattenObject(createdLogin),
        tenant_id,
      })
      .execute();

    return createdLogin;
  };
}
