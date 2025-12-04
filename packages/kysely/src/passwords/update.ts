import { Kysely } from "kysely";
import { Database } from "../db";
import { PasswordInsert } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (tenant_id: string, password: PasswordInsert) => {
    const results = await db
      .updateTable("passwords")
      .set({
        password: password.password,
        updated_at: new Date().toISOString(),
      })
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", password.user_id)
      .where("is_current", "=", 1)
      .execute();

    return results.length === 1;
  };
}
