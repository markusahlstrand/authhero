import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Database } from "../db";
import { Password, PasswordInsert } from "@authhero/adapter-interfaces";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, password: PasswordInsert) => {
    const id = password.id || nanoid();
    const isCurrent = password.is_current ?? true;
    const createdPassword: Password = {
      id,
      ...password,
      is_current: isCurrent,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isCurrent) {
      // Set any existing current password to not current
      await db
        .updateTable("passwords")
        .set({ is_current: 0 })
        .where("user_id", "=", password.user_id)
        .where("tenant_id", "=", tenant_id)
        .where("is_current", "=", 1)
        .execute();
    }

    await db
      .insertInto("passwords")
      .values({
        ...createdPassword,
        is_current: createdPassword.is_current ? 1 : 0,
        tenant_id,
      })
      .execute();

    return createdPassword;
  };
}
