import { Kysely } from "kysely";
import bcrypt from "bcryptjs";
import { Database } from "../db";
import { PasswordParams } from "@authhero/adapter-interfaces";

export function update(db: Kysely<Database>) {
  return async (tenant_id: string, params: PasswordParams) => {
    const passwordHash = bcrypt.hashSync(params.password, 10);

    const results = await db
      .updateTable("passwords")
      .set({
        password: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", params.user_id)
      .execute();

    return results.length === 1;
  };
}
