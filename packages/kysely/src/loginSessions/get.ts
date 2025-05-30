import { Kysely } from "kysely";
import { LoginSession, loginSessionSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { unflattenObject } from "../utils/flatten";
import { removeNullProperties } from "../helpers/remove-nulls";

export function get(db: Kysely<Database>) {
  return async (_: string, login_id: string): Promise<LoginSession | null> => {
    const now = new Date().toISOString();

    const login = await db
      .selectFrom("login_sessions")
      // TODO: We currently don't have a tenant_id in all cases here
      // .where("logins.tenant_id", "=", tenant_id)
      .where("login_sessions.expires_at", ">", now)
      .where("login_sessions.id", "=", login_id)
      .selectAll()
      .executeTakeFirst();

    if (!login) return null;

    return loginSessionSchema.parse(
      unflattenObject(
        removeNullProperties({
          ...login,
          login_completed: Boolean(login.login_completed),
        }),
        ["authParams"],
      ),
    );
  };
}
