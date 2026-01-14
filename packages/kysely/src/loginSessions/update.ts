import { LoginSessionInsert } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";
import { nowDbDate } from "../utils/dateConversion";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    login_id: string,
    login: Partial<LoginSessionInsert>,
  ) => {
    const flattened = flattenObject({
      ...login,
    });

    const results = await db
      .updateTable("login_sessions")
      .set({
        ...flattened,
        updated_at: nowDbDate(),
      })
      .where("login_sessions.id", "=", login_id)
      .where("login_sessions.tenant_id", "=", tenant_id)
      .execute();

    return results.length === 1;
  };
}
