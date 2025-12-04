import { Kysely } from "kysely";
import { Database } from "../db";
import { PasswordInsert } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (tenant_id: string, password: PasswordInsert) => {
    let query = db
      .updateTable("passwords")
      .set({
        password: password.password,
        algorithm: password.algorithm,
        is_current: password.is_current ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", password.user_id);

    // If an ID is provided, target that specific password record
    // Otherwise, target the current password
    if (password.id) {
      query = query.where("id", "=", password.id);
    } else {
      query = query.where("is_current", "=", 1);
    }

    const results = await query.execute();

    return results.length === 1;
  };
}
