import {
  LoginSessionInsert,
  loginSessionSchema,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, login: LoginSessionInsert) => {
    const rawLogin = {
      id: nanoid(),
      ...login,
      authorization_url: login.authorization_url?.slice(0, 1024),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Parse through schema to ensure proper types (applies defaults)
    const createdLogin = loginSessionSchema.parse(rawLogin);

    // Handle pipeline_state serialization before flattening
    const loginToFlatten = {
      ...createdLogin,
      pipeline_state: createdLogin.pipeline_state
        ? JSON.stringify(createdLogin.pipeline_state)
        : undefined,
    };

    await db
      .insertInto("login_sessions")
      .values({
        ...flattenObject(loginToFlatten),
        tenant_id,
      })
      .execute();

    return createdLogin;
  };
}
