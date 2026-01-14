import {
  LoginSession,
  LoginSessionInsert,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";
import { nowDbDate, nowIso } from "../utils/dateConversion";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, login: LoginSessionInsert) => {
    const now = nowIso();

    const createdLogin: LoginSession = {
      id: nanoid(),
      ...login,
      authorization_url: login.authorization_url?.slice(0, 1024),
      created_at: now,
      updated_at: now,
      state: login.state || LoginSessionState.PENDING,
      state_data: login.state_data,
      failure_reason: login.failure_reason,
    };

    // Write to DB with bigint timestamps
    const dbNow = nowDbDate();
    const flattenedLogin = flattenObject(createdLogin);
    await db
      .insertInto("login_sessions")
      .values({
        ...flattenedLogin,
        tenant_id,
        created_at: dbNow,
        updated_at: dbNow,
      })
      .execute();

    return createdLogin;
  };
}
