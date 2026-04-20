import {
  LoginSession,
  LoginSessionInsert,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { ulid } from "../utils/ulid";
import { Database } from "../db";
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

    // authParams is persisted exclusively in the `auth_params` JSON blob.
    // Strip it before flattening so the adapter doesn't try to emit the
    // legacy hoisted `authParams_*` columns — those were dropped in
    // 2026-04-20T12:00:00_drop_login_sessions_hoisted_authparams.
    const { authParams, ...rest } = createdLogin;
    const nowTs = Date.now();
    const flattenedLogin = flattenObject(rest) as Record<string, unknown>;
    delete flattenedLogin.created_at;
    delete flattenedLogin.updated_at;
    delete flattenedLogin.expires_at;
    await db
      .insertInto("login_sessions")
      .values({
        ...flattenedLogin,
        tenant_id,
        auth_params: JSON.stringify(authParams),
        created_at_ts: nowTs,
        updated_at_ts: nowTs,
        expires_at_ts: login.expires_at
          ? new Date(login.expires_at).getTime()
          : nowTs + 1000 * 60 * 60 * 24, // default: 24 hours from now
      })
      .execute();

    return createdLogin;
  };
}
