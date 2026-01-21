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

    const { created_at_ts, updated_at_ts, expires_at_ts, ...rest } = login;

    // Convert dates from DB format (bigint) to ISO strings
    const dates = convertDatesToAdapter(
      { created_at_ts, updated_at_ts, expires_at_ts },
      ["created_at_ts", "updated_at_ts", "expires_at_ts"],
    );

    return loginSessionSchema.parse(
      unflattenObject(
        removeNullProperties({
          ...rest,
          ...dates,
          state: login.state || LoginSessionState.PENDING,
          state_data: login.state_data,
          failure_reason: login.failure_reason,
        }),
        ["authParams"],
      ),
    );
  };
}
