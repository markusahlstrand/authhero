import { Kysely } from "kysely";
import {
  LoginSession,
  loginSessionSchema,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { unflattenObject } from "../utils/flatten";
import { removeNullProperties } from "../helpers/remove-nulls";
import { convertDatesToAdapter, DbDateField } from "../utils/dateConversion";

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

    const {
      created_at_ts,
      updated_at_ts,
      expires_at_ts,
      auth_params,
      ...rest
    } = login as typeof login & { auth_params?: string | null };

    // Convert dates from DB format (bigint) to ISO strings.
    // The flatten/extend chain in db.ts widens these to `unknown` at the type
    // level, but at runtime they're whatever the SQLite driver returns
    // (number | string | null) — the same shape DbDateField allows.
    const dates = convertDatesToAdapter(
      {
        created_at_ts: created_at_ts as DbDateField,
        updated_at_ts: updated_at_ts as DbDateField,
        expires_at_ts: expires_at_ts as DbDateField,
      },
      ["created_at_ts", "updated_at_ts", "expires_at_ts"],
    );

    // Unflatten only the nested groups still stored as hoisted columns.
    // authParams is now sourced from the `auth_params` JSON blob below; any
    // leftover `authParams_*` columns on `rest` are dropped by zod on parse.
    const unflattened = unflattenObject(
      removeNullProperties({
        ...rest,
        ...dates,
        state: login.state || LoginSessionState.PENDING,
        state_data: login.state_data,
        failure_reason: login.failure_reason,
      }),
      ["auth_strategy"],
    );

    unflattened.authParams =
      typeof auth_params === "string" && auth_params.length > 0
        ? JSON.parse(auth_params)
        : {};

    return loginSessionSchema.parse(unflattened);
  };
}
