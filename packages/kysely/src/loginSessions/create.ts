import {
  LoginSession,
  LoginSessionInsert,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { ulid } from "ulid";
import { Database } from "../db"
import { flattenObject } from "../utils/flatten";
import { nowIso } from "../utils/dateConversion";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, login: LoginSessionInsert) => {
    const now = nowIso();

    const createdLogin: LoginSession = {
      id: ulid(),
      ...login,
      authorization_url: login.authorization_url?.slice(0, 1024),
      created_at: now,
      updated_at: now,
      state: login.state || LoginSessionState.PENDING,
      state_data: login.state_data,
      failure_reason: login.failure_reason,
    };

    // Write to DB with bigint timestamps
    const nowTs = Date.now();
    const flattenedLogin = flattenObject(createdLogin) as Record<
      string,
      unknown
    >;
    // Remove date fields that are now stored as _ts columns
    delete flattenedLogin.created_at;
    delete flattenedLogin.updated_at;
    delete flattenedLogin.expires_at;
    await db
      .insertInto("login_sessions")
      .values({
        ...flattenedLogin,
        tenant_id,
        created_at_ts: nowTs,
        updated_at_ts: nowTs,
        expires_at_ts: nowTs + 1000 * 60 * 60 * 24, // 24 hours from now
      })
      .execute();

    return createdLogin;
  };
}
