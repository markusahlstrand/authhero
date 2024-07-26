import { LoginInsert } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { flattenObject } from "src/flattten";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    login_id: string,
    login: Partial<LoginInsert>,
  ) => {
    const results = await db
      .updateTable("logins")
      .set(flattenObject(login))
      .where("id", "=", login_id)
      .where("tenant_id", "=", tenant_id)
      .execute();

    return results.length === 1;
  };
}
