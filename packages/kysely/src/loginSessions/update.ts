import { LoginSessionInsert } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    login_id: string,
    login: Partial<LoginSessionInsert>,
  ) => {
    // Handle pipeline_state serialization before flattening
    const loginToFlatten = {
      ...login,
      pipeline_state: login.pipeline_state
        ? JSON.stringify(login.pipeline_state)
        : undefined,
    };

    const results = await db
      .updateTable("login_sessions")
      .set(
        flattenObject(loginToFlatten),
      )
      .where("login_sessions.id", "=", login_id)
      .where("login_sessions.tenant_id", "=", tenant_id)
      .execute();

    return results.length === 1;
  };
}
