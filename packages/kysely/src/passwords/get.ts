import { Kysely } from "kysely";
import { Database } from "../db";
import { Password } from "@authhero/adapter-interfaces";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, user_id: string): Promise<Password> => {
    const result = await db
      .selectFrom("passwords")
      .where("passwords.tenant_id", "=", tenant_id)
      .where("passwords.user_id", "=", user_id)
      .selectAll()
      .executeTakeFirstOrThrow();

    const { tenant_id: as, ...password } = result;

    return password;
  };
}