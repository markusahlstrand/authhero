import { Kysely } from "kysely";
import { LoginSession, loginSessionSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { unflattenObject } from "../utils/flatten";
import { removeNullProperties } from "../helpers/remove-nulls";

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

    // Parse pipeline_state if it's a string (from JSON storage)
    let pipeline_state = login.pipeline_state;
    if (typeof pipeline_state === "string") {
      try {
        pipeline_state = JSON.parse(pipeline_state);
      } catch {
        pipeline_state = undefined;
      }
    }

    return loginSessionSchema.parse(
      unflattenObject(
        removeNullProperties({
          ...login,
          pipeline_state,
        }),
        ["authParams"],
      ),
    );
  };
}
