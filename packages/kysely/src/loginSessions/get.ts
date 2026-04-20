import { Kysely } from "kysely";
import {
  LoginSession,
  loginSessionSchema,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { unflattenObject } from "../utils/flatten";
import { removeNullProperties } from "../helpers/remove-nulls";
import { convertDatesToAdapter } from "../utils/dateConversion";

export function get(db: Kysely<Database>) {
  return async (_: string, login_id: string): Promise<LoginSession | null> => {
    const login = await db
      .selectFrom("login_sessions")
      // TODO: We currently don't have a tenant_id in all cases here
      // .where("logins.tenant_id", "=", tenant_id)
      .where("login_sessions.id", "=", login_id)
      .selectAll()
      .executeTakeFirst();

    if (!login) return null;

    const { created_at_ts, updated_at_ts, expires_at_ts, auth_params, ...rest } =
      login as typeof login & { auth_params?: string | null };

    // Convert dates from DB format (bigint) to ISO strings
    const dates = convertDatesToAdapter(
      { created_at_ts, updated_at_ts, expires_at_ts },
      ["created_at_ts", "updated_at_ts", "expires_at_ts"],
    );

    const unflattened = unflattenObject(
      removeNullProperties({
        ...rest,
        ...dates,
        state: login.state || LoginSessionState.PENDING,
        state_data: login.state_data,
        failure_reason: login.failure_reason,
      }),
      ["authParams", "auth_strategy"],
    );

    // auth_params is the canonical source of truth when present. Parse it and
    // apply the hoisted overlay for the two mutable fields (username,
    // ui_locales) in case they diverge from the blob.
    if (typeof auth_params === "string" && auth_params.length > 0) {
      const parsed = JSON.parse(auth_params);
      unflattened.authParams = {
        ...parsed,
        ...(unflattened.authParams?.username !== undefined
          ? { username: unflattened.authParams.username }
          : {}),
        ...(unflattened.authParams?.ui_locales !== undefined
          ? { ui_locales: unflattened.authParams.ui_locales }
          : {}),
      };
    }
    // When auth_params is null (pre-backfill rows) the unflattened.authParams
    // reconstructed from hoisted columns is already the full source.

    return loginSessionSchema.parse(unflattened);
  };
}
